#!/usr/bin/env node
/**
 * Spec coverage gate (CI test plan B1). For every module this repo implements (spec-coverage.json
 * `modules`), each user story in the spec's §5 (`**US-xx-y**`) must be referenced by at least one
 * test file in this repo, or be waived in spec-coverage.json with a reason. Also fails on test
 * references to stories that don't exist (typos, renumbered specs), waivers for stories that are
 * covered or unknown, and implemented modules whose spec is still Draft. The §12 test plan of each
 * module is printed as a review checklist. Identical copy in CSR_BE and Resilisense-FE.
 *
 *   node scripts/spec-coverage.mjs        # table on stdout (+ $GITHUB_STEP_SUMMARY in CI), exit 1 on errors
 */
import { appendFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const STORY_ID = /\bUS-\d{2}-\d+\b/g;

/** Status, §5 story ids and §12 test-plan bullets of one module spec. */
export function parseSpec(markdown) {
  const status = /^>\s*Status:\s*([^·\n]+)/m.exec(markdown)?.[1]?.trim() ?? 'Unknown';
  const section = (n) => {
    const match = new RegExp(`^## ${n}\\.[^\\n]*\\n([\\s\\S]*?)(?=^## \\d+\\.|(?![\\s\\S]))`, 'm').exec(
      markdown,
    );
    return match?.[1] ?? '';
  };
  const stories = [...section(5).matchAll(/^\s*[-*]\s+\*\*(US-\d{2}-\d+)\*\*/gm)].map((m) => m[1]);
  const testPlan = section(12)
    .split('\n')
    .filter((line) => /^\s*[-*]\s+/.test(line))
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim());
  return { status, stories, testPlan };
}

/** Story ids referenced by each test file: Map<id, string[] of files>. */
export function collectReferences(files) {
  const refs = new Map();
  for (const { path, content } of files) {
    for (const id of new Set(content.match(STORY_ID) ?? [])) refs.set(id, [...(refs.get(id) ?? []), path]);
  }
  return refs;
}

/**
 * Pure check. specs: Map<moduleId, parsed spec>; config: { modules, waivers }; refs from
 * collectReferences. Returns { rows, errors, notes }.
 */
export function evaluate(specs, config, refs) {
  const errors = [];
  const notes = [];
  const rows = [];
  const waivers = config.waivers ?? {};
  const known = new Set([...specs.values()].flatMap((s) => s.stories));

  for (const module of config.modules) {
    const spec = specs.get(module);
    if (!spec) {
      errors.push(`${module}: no spec docs/revamp/modules/${module}-*.md`);
      continue;
    }
    if (/^draft/i.test(spec.status))
      errors.push(`${module}: implemented here but its spec is still "${spec.status}"`);
    if (spec.stories.length === 0) errors.push(`${module}: no **US-xx-y** stories found in §5`);
    for (const id of spec.stories) {
      const files = refs.get(id) ?? [];
      const waiver = waivers[id];
      if (files.length && waiver) errors.push(`${id}: covered by ${files[0]}; remove its waiver`);
      else if (!files.length && !waiver)
        errors.push(`${id}: no test references it (tag a test title, or waive it with a reason)`);
      rows.push({
        module,
        id,
        state: files.length ? 'covered' : waiver ? 'waived' : 'MISSING',
        detail: files[0] ?? waiver ?? '',
      });
    }
  }
  for (const [id, files] of refs) {
    if (!known.has(id)) errors.push(`${id}: referenced in ${files[0]} but not a story in any spec`);
  }
  for (const [id, reason] of Object.entries(waivers)) {
    if (!known.has(id)) errors.push(`${id}: waived but not a story in any spec`);
    else if (!String(reason).trim()) errors.push(`${id}: waiver needs a reason`);
  }
  for (const [module, spec] of specs) {
    if (!config.modules.includes(module) && !/^draft/i.test(spec.status))
      notes.push(`${module} is "${spec.status}" but not listed in spec-coverage.json modules`);
  }
  return { rows, errors, notes };
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'generated' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const config = JSON.parse(readFileSync(join(root, 'spec-coverage.json'), 'utf8'));
  const specDir = join(root, 'docs/revamp/modules');
  const specs = new Map();
  for (const name of readdirSync(specDir)) {
    const m = /^(M\d{2})-.*\.md$/.exec(name);
    if (m) specs.set(m[1], parseSpec(readFileSync(join(specDir, name), 'utf8')));
  }
  const pattern = new RegExp(config.testFiles);
  const files = config.testDirs
    .flatMap((dir) => [...walk(join(root, dir))])
    .map((p) => relative(root, p))
    .filter((p) => pattern.test(p))
    .map((path) => ({ path, content: readFileSync(join(root, path), 'utf8') }));
  const { rows, errors, notes } = evaluate(specs, config, collectReferences(files));

  const lines = [
    '## Spec coverage (user stories §5)',
    '',
    '| Module | Story | State | Where |',
    '| --- | --- | --- | --- |',
  ];
  for (const r of rows)
    lines.push(`| ${r.module} | ${r.id} | ${r.state} | ${r.detail.replace(/\|/g, '\\|')} |`);
  for (const module of config.modules) {
    const plan = specs.get(module)?.testPlan ?? [];
    if (plan.length)
      lines.push(
        '',
        `**${module} §12 test plan** (review against this PR):`,
        ...plan.map((p) => `- [ ] ${p}`),
      );
  }
  if (notes.length) lines.push('', ...notes.map((n) => `> ${n}`));
  if (errors.length) lines.push('', '**Errors**', ...errors.map((e) => `- ${e}`));
  const report = lines.join('\n') + '\n';
  process.stdout.write(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  for (const e of errors) if (process.env.GITHUB_ACTIONS) console.log(`::error title=spec coverage::${e}`);
  process.exitCode = errors.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
