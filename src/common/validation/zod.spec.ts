import { ZodError, z } from 'zod';
import { findNulCharacter, ZodValidationPipe } from './zod';

describe('ZodValidationPipe', () => {
  it.each([
    ['plain text', { a: 'x', b: ['y', { c: 1 }] }, null],
    ['a top-level string', 'a\u0000b', []],
    ['a nested value', { a: [{ b: 'ok' }, { b: 'x\u0000' }] }, ['a', '1', 'b']],
    ['a key', { 'k\u0000': 1 }, ['k\u0000']],
  ])('finds NUL characters in %s', (_name, value, path) => {
    expect(findNulCharacter(value)).toEqual(path);
  });

  it('rejects NUL characters as a validation error before parsing', () => {
    const pipe = new ZodValidationPipe(z.object({ name: z.string() }));
    expect(() => pipe.transform({ name: 'a\u0000' })).toThrow(ZodError);
    expect(pipe.transform({ name: 'a' })).toEqual({ name: 'a' });
  });
});
