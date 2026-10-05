import { type INestApplication } from '@nestjs/common';
import { type OpenAPIObject } from '@nestjs/swagger';
import { Ajv, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { NextFunction, Request, Response } from 'express';
import { PROBLEM_TYPES } from '../../src/common/errors/problem';
import { buildOpenApi } from '../../src/bootstrap';

/**
 * Contract recorder (CI test plan A1): every response an e2e test receives is checked against the
 * OpenAPI document built from the running app — the same document `npm run openapi` commits and the
 * FE generates its client from. A response that the contract does not describe fails the test that
 * caused it (see contract-setup.ts), so every e2e test is also a contract test.
 *
 *  - 2xx: the status must be documented for the operation, and the body must match its schema
 *    (204 → empty body).
 *  - 4xx/5xx: the body must be RFC 9457 problem+json with a known stable `type` whose status matches.
 */

export interface ContractViolation {
  request: string;
  status: number;
  problem: string;
}

const violations: ContractViolation[] = [];

/** Returns and clears the violations recorded since the last call. */
export function drainContractViolations(): ContractViolation[] {
  return violations.splice(0);
}

const PROBLEM_TYPE_URI = /^https:\/\/resilisense\.org\/problems\/([a-z_]+)$/;

const problemSchema = {
  type: 'object',
  required: ['type', 'title', 'status'],
  properties: {
    type: { type: 'string', pattern: PROBLEM_TYPE_URI.source },
    title: { type: 'string', minLength: 1 },
    status: { type: 'integer', minimum: 400, maximum: 599 },
    detail: { type: 'string' },
    instance: { type: 'string' },
    requestId: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'message'],
        properties: { path: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
};

interface Operation {
  key: string;
  regex: RegExp;
  params: number;
  responses: Record<string, { content?: Record<string, { schema?: object }> }>;
}

export class ContractChecker {
  private readonly ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
  private readonly operations = new Map<string, Operation[]>();
  private readonly validators = new Map<string, ValidateFunction>();
  private readonly problem: ValidateFunction;

  constructor(source: OpenAPIObject) {
    const doc = allowNullInNullableEnums(structuredClone(source));
    addFormats(this.ajv);
    for (const [name, schema] of Object.entries(doc.components?.schemas ?? {}))
      this.ajv.addSchema(schema, `#/components/schemas/${name}`);
    this.problem = this.ajv.compile(problemSchema);
    for (const [path, item] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(
        item as Record<string, { responses?: Operation['responses'] }>,
      )) {
        if (!op?.responses) continue;
        const params = (path.match(/\{[^}]+\}/g) ?? []).length;
        const regex = new RegExp(
          `^${path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}/?$`,
        );
        const list = this.operations.get(method) ?? [];
        list.push({ key: `${method.toUpperCase()} ${path}`, regex, params, responses: op.responses });
        this.operations.set(method, list);
      }
    }
    // Literal segments win over templated ones (`/me/sessions` before `/me/{id}`).
    for (const list of this.operations.values()) list.sort((a, b) => a.params - b.params);
  }

  /** Returns the contract problems of one response (empty when it conforms). */
  check(method: string, url: string, status: number, contentType: string, raw: string): string[] {
    const path = url.split('?')[0]!;
    const op = this.operations.get(method.toLowerCase())?.find((o) => o.regex.test(path));

    if (status >= 400) {
      if (!contentType.startsWith('application/problem+json'))
        return [
          `error response is ${contentType || 'without content type'}, expected application/problem+json`,
        ];
      const body = parseJson(raw);
      if (body === undefined) return ['error body is not valid JSON'];
      if (!this.problem(body)) return [`problem+json: ${this.ajv.errorsText(this.problem.errors)}`];
      const { type, status: bodyStatus } = body as { type: string; status: number };
      const name = PROBLEM_TYPE_URI.exec(type)![1]!;
      if (!(name in PROBLEM_TYPES)) return [`unknown problem type "${name}" (add it to PROBLEM_TYPES)`];
      if (bodyStatus !== status) return [`problem status ${bodyStatus} differs from HTTP status ${status}`];
      return [];
    }

    if (!op) return [`${method} ${path} answered ${status} but is not in the OpenAPI document`];
    const response = op.responses[String(status)];
    if (!response) {
      const documented = Object.keys(op.responses).join(', ');
      return [
        `${op.key} answered ${status}; documented: ${documented} (use @ApiZodOk/@ApiZodResponse/@HttpCode)`,
      ];
    }
    const json = response.content?.['application/json'];
    if (!json?.schema) {
      return raw.length === 0 ? [] : [`${op.key} ${status} is documented without a body but returned one`];
    }
    if (!contentType.startsWith('application/json'))
      return [
        `${op.key} ${status} returned ${contentType || 'no content type'}, documented application/json`,
      ];
    const body = parseJson(raw);
    if (body === undefined) return [`${op.key} ${status} body is not valid JSON`];
    const cacheKey = `${op.key} ${status}`;
    let validate = this.validators.get(cacheKey);
    if (!validate) {
      validate = this.ajv.compile(json.schema);
      this.validators.set(cacheKey, validate);
    }
    if (!validate(body)) return [`${op.key} ${status} body: ${this.ajv.errorsText(validate.errors)}`];
    return [];
  }
}

/**
 * OpenAPI 3.0 `nullable: true` does not add `null` to an `enum` (3.0.3 clarification), so Ajv would
 * reject `null` for a Zod `.nullable()` enum that clients — orval included — read as `T | null`.
 */
function allowNullInNullableEnums<T>(node: T): T {
  if (Array.isArray(node)) node.forEach(allowNullInNullableEnums);
  else if (node && typeof node === 'object') {
    const schema = node as Record<string, unknown>;
    if (schema.nullable === true && Array.isArray(schema.enum) && !schema.enum.includes(null))
      schema.enum = [...(schema.enum as unknown[]), null];
    Object.values(schema).forEach(allowNullInNullableEnums);
  }
  return node;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Records every response of the app. Call before `app.init()`; the checker is built lazily from the
 * app itself on the first response, so the document always matches the code under test.
 */
export function recordContract(app: INestApplication): void {
  let checker: ContractChecker | undefined;
  app.use((req: Request, res: Response, next: NextFunction) => {
    const chunks: Buffer[] = [];
    const write = res.write.bind(res) as (...args: unknown[]) => boolean;
    const end = res.end.bind(res) as (...args: unknown[]) => Response;
    const collect = (chunk: unknown) => {
      if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
      else if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
    };
    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      collect(chunk);
      return write(chunk, ...rest);
    }) as Response['write'];
    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      if (typeof chunk !== 'function') collect(chunk);
      return end(chunk, ...rest);
    }) as Response['end'];
    res.on('finish', () => {
      checker ??= new ContractChecker(buildOpenApi(app));
      const problems = checker.check(
        req.method,
        req.originalUrl,
        res.statusCode,
        String(res.getHeader('content-type') ?? ''),
        Buffer.concat(chunks).toString('utf8'),
      );
      for (const problem of problems)
        violations.push({ request: `${req.method} ${req.originalUrl}`, status: res.statusCode, problem });
    });
    next();
  });
}
