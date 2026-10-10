// Identical copy in CSR_BE and Resilisense-FE (formatted in CSR_BE).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSpec, plan } from './plan-status.mjs';

const mod = (folder, wave, extra = {}) => ({
  folder,
  plan: 'SD00',
  spec: 'M99',
  wave,
  be: [`src/modules/${folder}`],
  fe: [`src/features/${folder}`],
  dependsOn: [],
  ...extra,
});
const ready = { status: 'Ready', contract: true };
const facts = (entries) => new Map(entries);
const f = (spec, card, be, fe) => ({ spec, card, built: { be, fe } });

describe('plan status', () => {
  it('reads the spec status and whether §14 names the module', () => {
    const md =
      '# M99\n\n> Status: Ready · Phase: 2\n\n## 13. Questions\n\n## 14. Module contract\nOwns `risk` tables\n';
    expect(parseSpec(md, 'risk')).toEqual({ status: 'Ready', contract: true });
    expect(parseSpec(md, 'screening')).toEqual({ status: 'Ready', contract: false });
    expect(parseSpec('> Status: Draft | Ready\n', 'risk')).toEqual({ status: 'Draft', contract: false });
  });

  it('walks a module through contract, approval, backend and frontend', () => {
    const modules = [mod('a', 1)];
    const step = (x) => plan(modules, facts([['a', x]])).modules[0].next;
    expect(step(f(null, false, false, false))).toBe('contract');
    expect(step(f({ status: 'Draft', contract: true }, false, false, false))).toBe('contract');
    expect(step(f({ status: 'Draft', contract: true }, true, false, false))).toBe('approve');
    expect(step(f(ready, true, false, false))).toBe('build-be');
    expect(step(f(ready, true, true, false))).toBe('build-fe');
    expect(step(f(ready, true, true, true))).toBe('done');
    expect(step(f(ready, true, false, null))).toBe('build-be');
    expect(step(f(ready, true, true, null))).toBe('unknown');
  });

  it('treats a side the module does not live on as done', () => {
    const modules = [mod('a', 1, { fe: [] })];
    expect(plan(modules, facts([['a', f(ready, true, true, false)]])).modules[0].next).toBe('done');
  });

  it('blocks a build until every dependency has at least a contract', () => {
    const modules = [mod('dep', 1), mod('a', 1, { dependsOn: ['dep'] })];
    const blocked = plan(
      modules,
      facts([
        ['dep', f(null, false, false, false)],
        ['a', f(ready, true, false, false)],
      ]),
    );
    expect(blocked.modules[1]).toMatchObject({ next: 'blocked', detail: 'no contract yet: dep' });
    const faked = plan(
      modules,
      facts([
        ['dep', f(ready, true, false, false)],
        ['a', f(ready, true, false, false)],
      ]),
    );
    expect(faked.modules[1].next).toBe('build-be');
  });

  it('queues the frontier wave and the next one, started work first, optional modules left out', () => {
    const modules = [
      mod('done', 0),
      mod('c1', 1),
      mod('b1', 1),
      mod('c2', 2),
      mod('opt', 2, { optional: 'licence' }),
      mod('c3', 3),
    ];
    const state = facts([
      ['done', f(ready, true, true, true)],
      ['c1', f(null, false, false, false)],
      ['b1', f(ready, true, true, false)],
      ['c2', f(null, false, false, false)],
      ['opt', f(null, false, false, false)],
      ['c3', f(null, false, false, false)],
    ]);
    const result = plan(modules, state);
    expect(result.frontier).toBe(1);
    expect(result.queue.map((q) => `${q.next} ${q.folder}`)).toEqual([
      'build-fe b1',
      'contract c1',
      'contract c2',
    ]);
    expect(plan(modules, state, { includeOptional: true }).queue.map((q) => q.folder)).toContain('opt');
  });

  it('has a consistent plan.json: unique folders, known dependencies, earlier-or-same waves', () => {
    const { modules } = JSON.parse(readFileSync(join(process.cwd(), 'docs/revamp/plan.json'), 'utf8'));
    const byFolder = new Map(modules.map((m) => [m.folder, m]));
    expect(byFolder.size).toBe(modules.length);
    for (const m of modules) {
      expect(m.spec ?? m.proposedSpec).toMatch(/^M\d{2}$/);
      for (const dep of m.dependsOn) {
        expect(byFolder.has(dep), `${m.folder} → ${dep}`).toBe(true);
        expect(byFolder.get(dep).wave, `${m.folder} → ${dep}`).toBeLessThanOrEqual(m.wave);
      }
    }
  });
});
