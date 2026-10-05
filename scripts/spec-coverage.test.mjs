import { collectReferences, evaluate, parseSpec } from './spec-coverage.mjs';

const spec = `# M09 — Example
> Status: Ready · Phase: 2

## 5. User stories & acceptance criteria
- **US-09-1** As a user I do a thing.
  - AC: mentions US-09-9 in passing, which is not a story.
- **US-09-2** As an admin I do another.

## 12. Test plan
- Unit: band boundaries.
- E2E: happy path.

## 13. Open questions
- **US-09-3** is not in §5.
`;

describe('spec coverage', () => {
  it('parses status, §5 stories and §12 bullets', () => {
    expect(parseSpec(spec)).toEqual({
      status: 'Ready',
      stories: ['US-09-1', 'US-09-2'],
      testPlan: ['Unit: band boundaries.', 'E2E: happy path.'],
    });
  });

  const specs = new Map([['M09', parseSpec(spec)]]);
  const refs = (...files) => collectReferences(files.map(([path, content]) => ({ path, content })));

  it('passes when every story is tested or waived', () => {
    const result = evaluate(
      specs,
      { modules: ['M09'], waivers: { 'US-09-2': 'UI only' } },
      refs(['a.spec.ts', "it('US-09-1: works')"]),
    );
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.state)).toEqual(['covered', 'waived']);
  });

  it.each([
    ['an untested story', { modules: ['M09'] }, [['a.spec.ts', 'US-09-1']], /US-09-2: no test references it/],
    [
      'a waiver for a covered story',
      { modules: ['M09'], waivers: { 'US-09-1': 'x', 'US-09-2': 'y' } },
      [['a.spec.ts', 'US-09-1']],
      /US-09-1: covered .* remove its waiver/,
    ],
    [
      'a test tag that is not a story',
      { modules: [] },
      [['a.spec.ts', 'US-09-7']],
      /US-09-7: referenced in a.spec.ts but not a story/,
    ],
    [
      'a waiver for an unknown story',
      { modules: [], waivers: { 'US-09-8': 'x' } },
      [],
      /US-09-8: waived but not a story/,
    ],
    [
      'an empty waiver reason',
      { modules: [], waivers: { 'US-09-1': ' ' } },
      [],
      /US-09-1: waiver needs a reason/,
    ],
    ['a module without a spec', { modules: ['M42'] }, [], /M42: no spec/],
  ])('fails on %s', (_name, config, files, message) => {
    expect(evaluate(specs, config, refs(...files)).errors.join('\n')).toMatch(message);
  });

  it('fails when an implemented module is still Draft, and notes Ready specs not tracked', () => {
    const draft = new Map([['M09', { ...parseSpec(spec), status: 'Draft' }]]);
    expect(
      evaluate(draft, { modules: ['M09'], waivers: { 'US-09-1': 'x', 'US-09-2': 'y' } }, refs()).errors,
    ).toEqual(['M09: implemented here but its spec is still "Draft"']);
    expect(evaluate(specs, { modules: [] }, refs()).notes).toEqual([
      'M09 is "Ready" but not listed in spec-coverage.json modules',
    ]);
  });
});
