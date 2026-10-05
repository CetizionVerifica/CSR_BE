import { type OpenAPIObject } from '@nestjs/swagger';
import { ContractChecker } from './support/contract';

/** The contract recorder must catch what it claims to catch (CI test plan A1). No database needed. */
describe('contract checker', () => {
  const item = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'role'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      role: { nullable: true, type: 'string', enum: ['owner', 'viewer'] },
    },
  };
  const json = (schema: object) => ({ description: 'OK', content: { 'application/json': { schema } } });
  const doc = {
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths: {
      '/v1/things/{id}': { get: { responses: { '200': json(item) } }, delete: { responses: { '204': {} } } },
      '/v1/things/mine': { get: { responses: { '200': json({ type: 'array', items: item }) } } },
    },
  } as unknown as OpenAPIObject;
  const checker = new ContractChecker(doc);
  const id = '01a107af-de53-7bdf-909f-651aa074d32f';
  const thing = `/v1/things/${id}`;
  const JSON_ = 'application/json';
  const PROBLEM = 'application/problem+json';
  const body = (value: unknown) => JSON.stringify(value);
  const problem = (type: string, status: number) =>
    body({ type: `https://resilisense.org/problems/${type}`, title: 'x', status });

  it.each([
    ['documented body', 'GET', thing, 200, JSON_, body({ id, role: 'owner' })],
    ['nullable enum set to null', 'GET', thing, 200, JSON_, body({ id, role: null })],
    ['literal path before template', 'GET', '/v1/things/mine?limit=1', 200, JSON_, body([])],
    ['204 without body', 'DELETE', thing, 204, '', ''],
    ['known problem type', 'GET', thing, 404, PROBLEM, problem('not_found', 404)],
    ['problem on an unknown route', 'GET', '/v1/nope', 404, PROBLEM, problem('not_found', 404)],
  ])('accepts %s', (_name, method, url, status, type, raw) => {
    expect(checker.check(method, url, status, type, raw)).toEqual([]);
  });

  it.each([
    ['an undocumented status', 'GET', thing, 201, JSON_, body({ id, role: null }), /documented: 200/],
    ['a missing field', 'GET', thing, 200, JSON_, body({ id }), /must have required property 'role'/],
    ['an extra field', 'GET', thing, 200, JSON_, body({ id, role: null, x: 1 }), /additional properties/],
    ['a wrong enum value', 'GET', thing, 200, JSON_, body({ id, role: 'admin' }), /allowed values/],
    ['a bad format', 'GET', thing, 200, JSON_, body({ id: 'x', role: null }), /format "uuid"/],
    ['a body on a 204', 'DELETE', thing, 204, JSON_, body({}), /without a body/],
    ['a 2xx route missing from the document', 'GET', '/v1/nope', 200, JSON_, body({}), /not in the OpenAPI/],
    ['a non-problem error', 'GET', thing, 400, JSON_, body({ message: 'x' }), /problem\+json/],
    ['an unknown problem type', 'GET', thing, 400, PROBLEM, problem('oops', 400), /unknown problem type/],
    ['a problem status mismatch', 'GET', thing, 409, PROBLEM, problem('not_found', 404), /differs/],
  ])('rejects %s', (_name, method, url, status, type, raw, message) => {
    const problems = checker.check(method, url, status, type, raw);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(message);
  });
});
