import { applyDecorators, type PipeTransform } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { type z } from 'zod';
import { toJSONSchema } from 'zod';

/** JSON Schema (OpenAPI 3.0 dialect) for a Zod schema — used for API docs. */
export function openApiSchema(schema: z.ZodType): Record<string, unknown> {
  return toJSONSchema(schema, { target: 'openapi-3.0', unrepresentable: 'any' });
}

/** Validates and parses input with a Zod schema; failures become 400 validation_failed problems. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
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
