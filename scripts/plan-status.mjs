#!/usr/bin/env node
/**
 * Plan status (docs/revamp/06-modular-build.md §8). Reads docs/revamp/plan.json, the module specs and
 * the module folders of this repo and, when it is checked out next to this one, of the sibling repo,
 * and prints where every module stands and what the next step is. The /run-plan skill picks its work
 * from this output, so nobody has to track the plan by hand. Identical copy in CSR_BE and
 * Resilisense-FE (formatted in CSR_BE).
 *
 *   node scripts/plan-status.mjs                 # table
 *   node scripts/plan-status.mjs --json          # { modules, queue } for /run-plan
 *   node scripts/plan-status.mjs --sibling <dir> # sibling repo path (default ../CSR_BE or ../Resilisense-FE)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Spec status line, whether §14 is filled in for `folder`. */
export function parseSpec(markdown, folder) {
  const status = /^>\s*Status:\s*([^·|\n]+)/m.exec(markdown)?.[1]?.trim() ?? 'Unknown';
  const contract = /^## 14\.[^\n]*\n([\s\S]*?)(?=^## \d+\.|(?![\s\S]))/m.exec(markdown)?.[1] ?? '';
  return { status, contract: contract.includes(folder) };
}

const READY = new Set(['Ready', 'In progress', 'Shipped']);

/** Whether a module is built in every repo it lives in (a repo not checked out counts as not built). */
function isDone(module, facts) {
  return ['be', 'fe'].every((side) => module[side].length === 0 || facts.built[side] === true);
}

/**
 * Pure step decision for one module. facts: Map<folder, { spec: {status, contract}|null, card: bool,
 * built: { be: bool|null, fe: bool|null } }> (null = that repo is not checked out); byFolder: the
 * plan's modules by folder. Returns { next, detail? } where next is one of
 * contract · approve · build-be · build-fe · done · blocked · unknown.
 */
export function nextStep(module, facts, byFolder) {
  const own = facts.get(module.folder);
  const { spec, card, built } = own;
  if (isDone(module, own)) return { next: 'done' };
  if (!spec || !spec.contract || !card) return { next: 'contract' };
  if (!READY.has(spec.status)) return { next: 'approve', detail: `spec is ${spec.status}` };
  const missing = module.dependsOn.filter((dep) => {
    const f = facts.get(dep);
    return !f || !(f.card || isDone(byFolder.get(dep), f));
  });
  if (missing.length) return { next: 'blocked', detail: `no contract yet: ${missing.join(', ')}` };
  if (module.be.length && built.be !== true) {
    return built.be === null
      ? { next: 'unknown', detail: 'backend repo not checked out' }
      : { next: 'build-be' };
  }
  if (built.fe === null) return { next: 'unknown', detail: 'frontend repo not checked out' };
  return { next: 'build-fe' };
}

/**
 * Pure planner. modules from plan.json in catalogue order; facts as for nextStep. The frontier is
 * the lowest wave with unfinished modules; work is offered for that wave and the next one (06 §6: a
 * module may start one wave early against contract fakes). Optional modules are left out of the
 * queue unless includeOptional. Queue order: finish what is started (build-fe, build-be), then
 * approvals, then new contracts, lower waves first.
 */
export function plan(modules, facts, { includeOptional = false } = {}) {
  const byFolder = new Map(modules.map((m) => [m.folder, m]));
  const result = modules.map((m) => ({
    folder: m.folder,
    plan: m.plan,
    spec: m.spec ?? `${m.proposedSpec} (new, from ${m.parentSpec})`,
    wave: m.wave,
    optional: m.optional ?? null,
    ...nextStep(m, facts, byFolder),
  }));
  const open = result.filter((r) => r.next !== 'done' && (includeOptional || !r.optional));
  const frontier = open.length ? Math.min(...open.map((r) => r.wave)) : null;
  const order = { 'build-fe': 0, 'build-be': 1, approve: 2, contract: 3 };
  const queue = open
    .filter((r) => r.wave <= frontier + 1 && r.next in order)
    .sort((a, b) => a.wave - b.wave || order[a.next] - order[b.next])
    .map(({ folder, next, wave, spec }) => ({ folder, next, wave, spec }));
  return { frontier, modules: result, queue };
}

/** A folder counts as built when it holds anything besides its module card. */
function hasCode(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  return readdirSync(dir).some((name) => name !== 'CLAUDE.md');
}

function repoKind(dir) {
  if (existsSync(join(dir, 'nest-cli.json'))) return 'be';
  if (existsSync(join(dir, 'vite.config.ts'))) return 'fe';
  return null;
}

function specFor(id, specsDir) {
  if (!id) return null;
  const file = readdirSync(specsDir).find((name) => name.startsWith(`${id}-`) && name.endsWith('.md'));
  return file ? readFileSync(join(specsDir, file), 'utf8') : null;
}

export function collectFacts(modules, repos, specsDir) {
  const facts = new Map();
  for (const m of modules) {
    const markdown = specFor(m.spec, specsDir);
    const built = {};
    let card = false;
    for (const side of ['be', 'fe']) {
      const root = repos[side];
      built[side] = root ? m[side].some((dir) => hasCode(join(root, dir))) : null;
      if (root && m[side][0]) card ||= existsSync(join(root, m[side][0], 'CLAUDE.md'));
    }
    facts.set(m.folder, { spec: markdown ? parseSpec(markdown, m.folder) : null, card, built });
  }
  return facts;
}

function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const kind = repoKind(root);
  const flag = argv.indexOf('--sibling');
  const siblingName = kind === 'be' ? 'Resilisense-FE' : 'CSR_BE';
  const sibling = flag >= 0 ? resolve(argv[flag + 1]) : resolve(root, '..', siblingName);
  const repos = { [kind]: root };
  const other = kind === 'be' ? 'fe' : 'be';
  if (repoKind(sibling) === other) repos[other] = sibling;

  const { modules } = JSON.parse(readFileSync(join(root, 'docs/revamp/plan.json'), 'utf8'));
  const result = plan(modules, collectFacts(modules, repos, join(root, 'docs/revamp/modules')), {
    includeOptional: argv.includes('--include-optional'),
  });
  result.repos = Object.fromEntries(Object.entries(repos).map(([k, v]) => [k, basename(v)]));

  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Repos: ${Object.values(result.repos).join(' + ')} · frontier wave ${result.frontier}\n`);
  console.log('| Module | Plan | Spec | Wave | Next | Detail |\n| --- | --- | --- | --- | --- | --- |');
  for (const r of result.modules) {
    const detail = [r.detail, r.optional && `optional: ${r.optional}`].filter(Boolean).join('; ');
    console.log(`| ${r.folder} | ${r.plan} | ${r.spec} | ${r.wave} | ${r.next} | ${detail} |`);
  }
  console.log(`\nQueue: ${result.queue.map((q) => `${q.next} ${q.folder}`).join(' → ') || 'empty'}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));
