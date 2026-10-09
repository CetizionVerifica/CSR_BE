// Identical copy in CSR_BE and Resilisense-FE (formatted in CSR_BE).
import { boundaryViolation, moduleOf, resolveImport } from './module-boundaries.mjs';

const be = {
  root: 'src/modules',
  layers: [{ from: 'src/common', forbid: ['src/modules'], except: ['src/modules/identity'] }],
};
const fe = {
  root: 'src/features',
  alias: { '@/': 'src/' },
  layers: [{ from: 'src/components', forbid: ['src/features', 'src/app'] }],
};

describe('module boundaries lint rule', () => {
  it('resolves relative and aliased specifiers, ignores packages', () => {
    expect(resolveImport('src/modules/a/x.ts', '../b/y')).toBe('src/modules/b/y');
    expect(resolveImport('src/features/a/x.tsx', '@/features/b/c.tsx', fe.alias)).toBe('src/features/b/c');
    expect(resolveImport('src/modules/a/x.ts', '@nestjs/common')).toBeNull();
  });

  it('finds the owning module of a file', () => {
    expect(moduleOf('src/modules/identity/engine/tokens.ts', 'src/modules')).toBe('identity');
    expect(moduleOf('src/modules/index.ts', 'src/modules')).toBeNull();
    expect(moduleOf('src/common/ids.ts', 'src/modules')).toBeNull();
  });

  it('allows imports inside a module and through another module public entry', () => {
    expect(boundaryViolation('src/modules/a/x.ts', './engine/y', be)).toBeNull();
    expect(boundaryViolation('src/modules/a/dto/x.ts', '../engine/y', be)).toBeNull();
    expect(boundaryViolation('src/modules/a/x.ts', '../b', be)).toBeNull();
    expect(boundaryViolation('src/modules/a/x.ts', '../b/index', be)).toBeNull();
    expect(boundaryViolation('src/features/a/x.tsx', '@/features/b', fe)).toBeNull();
    expect(boundaryViolation('src/features/a/x.tsx', '@/components/ui/button', fe)).toBeNull();
  });

  it('rejects deep imports into another module', () => {
    expect(boundaryViolation('src/modules/a/x.ts', '../b/b.service', be)).toEqual({
      kind: 'deep',
      target: 'src/modules/b/b.service',
      entry: 'src/modules/b',
    });
    expect(boundaryViolation('src/features/a/pages/p.tsx', '@/features/b/schemas', fe)?.kind).toBe('deep');
    expect(boundaryViolation('src/features/a/p.tsx', '../b/components/c', fe)?.kind).toBe('deep');
  });

  it('rejects shared layers depending on modules, except listed public entries', () => {
    expect(boundaryViolation('src/components/ui/x.tsx', '@/features/a', fe)?.kind).toBe('layer');
    expect(boundaryViolation('src/components/charts/x.tsx', '@/app/router', fe)?.kind).toBe('layer');
    expect(boundaryViolation('src/common/auth/g.ts', '../../modules/identity', be)).toBeNull();
    expect(boundaryViolation('src/common/auth/g.ts', '../../modules/identity/engine/p', be)?.kind).toBe(
      'layer',
    );
    expect(boundaryViolation('src/common/auth/g.ts', '../../modules/workspaces', be)?.kind).toBe('layer');
  });

  it('leaves composition roots outside the module root alone', () => {
    expect(boundaryViolation('src/app.module.ts', './modules/identity/identity.module', be)).toBeNull();
    expect(boundaryViolation('src/app/router.tsx', '@/features/auth/routes', fe)).toBeNull();
  });
});
