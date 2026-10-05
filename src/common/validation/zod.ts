import { applyDecorators, type PipeTransform } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { type z } from 'zod';
import { toJSONSchema, ZodError } from 'zod';

/** JSON Schema (OpenAPI 3.0 dialect) for a Zod schema — used for API docs. */
export function openApiSchema(schema: z.ZodType): Record<string, unknown> {
  return toJSONSchema(schema, { target: 'openapi-3.0', unrepresentable: 'any' });
}

/** Path of the first string containing a NUL character (PostgreSQL text cannot store it), or null. */
export function findNulCharacter(value: unknown, path: string[] = []): string[] | null {
  if (typeof value === 'string') return value.includes('\u0000') ? path : null;
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      const found = findNulCharacter(item, [...path, String(i)]);
      if (found) return found;
    }
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const found = findNulCharacter(key, [...path, key]) ?? findNulCharacter(item, [...path, key]);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Validates and parses input with a Zod schema; failures become 400 validation_failed problems.
 * Strings with NUL characters are rejected first, so they never reach PostgreSQL as a 500.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const nul = findNulCharacter(value);
    if (nul) {
      throw new ZodError([
        { code: 'custom', path: nul, message: 'Text must not contain NUL characters', input: undefined },
      ]);
    }
    return this.schema.parse(value);
  }
}

/** Documents a Zod request body. Use with `@Body(new ZodValidationPipe(schema))`. */
export const ApiZodBody = (schema: z.ZodType) => ApiBody({ schema: openApiSchema(schema) });

/** Documents a Zod 200 response. */
export const ApiZodOk = (schema: z.ZodType, description = 'OK') =>
  ApiOkResponse({ description, schema: openApiSchema(schema) });

/** Documents query parameters of a flat Zod object schema. */
export const ApiZodQuery = (schema: z.ZodObject) =>
  applyDecorators(
    ...Object.entries(schema.shape).map(([name, field]) =>
      ApiQuery({
        name,
        required: !(field as z.ZodType).safeParse(undefined).success,
        schema: openApiSchema(field as z.ZodType),
      }),
    ),
  );

/** Documents a Zod response with an explicit status (201, 202, …). */
export const ApiZodResponse = (status: number, schema: z.ZodType, description = 'OK') =>
  ApiResponse({ status, description, schema: openApiSchema(schema) });
