// Identical copy in CSR_BE and Resilisense-FE (formatted in CSR_BE). docs/revamp/06-modular-build.md §3.
import path from 'node:path';

/**
 * @typedef {{ from: string, forbid: string[], except?: string[] }} Layer
 * @typedef {{ root: string, alias?: Record<string, string>, layers?: Layer[] }} BoundaryOptions
 */

const toPosix = (/** @type {string} */ p) => p.split(path.sep).join('/');
const stripExt = (/** @type {string} */ p) => p.replace(/\.(?:[cm]?[jt]sx?)$/, '');
const under = (/** @type {string} */ p, /** @type {string} */ dir) => p === dir || p.startsWith(`${dir}/`);

/**
 * Resolve an import specifier to a repo-relative posix path, or null for packages.
 * @param {string} fromFile repo-relative path of the importing file
 * @param {string} source import specifier
 * @param {Record<string, string>} [alias] specifier prefix → repo-relative dir, e.g. { '@/': 'src/' }
 */
export function resolveImport(fromFile, source, alias = {}) {
  if (source.startsWith('.')) {
    return stripExt(path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), source)));
  }
  for (const [prefix, dir] of Object.entries(alias)) {
    if (source.startsWith(prefix)) return stripExt(path.posix.normalize(dir + source.slice(prefix.length)));
  }
  return null;
}

/** First folder under `root`, e.g. moduleOf('src/modules/identity/a.ts', 'src/modules') → 'identity'. */
export function moduleOf(/** @type {string} */ file, /** @type {string} */ root) {
  if (!file.startsWith(`${root}/`)) return null;
  const [name, ...rest] = file.slice(root.length + 1).split('/');
  return rest.length > 0 ? (name ?? null) : null;
}

/**
 * Why an import crosses a boundary, or null when it is allowed.
 * - A module may import another module only through its public entry (`<root>/<name>` or `<root>/<name>/index`).
 * - A layer (`from`) may not import the folders it forbids, except the listed public entries.
 * @param {string} fromFile repo-relative posix path
 * @param {string} source import specifier
 * @param {BoundaryOptions} options
 * @returns {{ kind: 'deep', target: string, entry: string } | { kind: 'layer', target: string, layer: string } | null}
 */
export function boundaryViolation(fromFile, source, options) {
  const target = resolveImport(fromFile, source, options.alias);
  if (!target) return null;
  for (const layer of options.layers ?? []) {
    if (!under(fromFile, layer.from)) continue;
    const forbidden = layer.forbid.find((dir) => under(target, dir));
    if (!forbidden) continue;
    const allowed = (layer.except ?? []).some((entry) => target === entry || target === `${entry}/index`);
    if (!allowed) return { kind: 'layer', target, layer: `${layer.from} → ${forbidden}` };
  }
  const own = moduleOf(fromFile, options.root);
  if (!own || !under(target, options.root)) return null;
  const [other, ...rest] = target.slice(options.root.length + 1).split('/');
  if (!other || other === own) return null;
  const isEntry = rest.length === 0 || (rest.length === 1 && rest[0] === 'index');
  return isEntry ? null : { kind: 'deep', target, entry: `${options.root}/${other}` };
}

/** @type {import('eslint').Rule.RuleModule} */
export const moduleBoundaries = {
  meta: {
    type: 'problem',
    docs: { description: 'Modules talk to each other only through their public index (06-modular-build §3)' },
    schema: [{ type: 'object', additionalProperties: true }],
    messages: {
      deep: '"{{source}}" reaches into another module. Import its public entry "{{entry}}" and export what you need from its index.ts.',
      layer: '"{{source}}" breaks the layer rule {{layer}}: shared code must not depend on feature modules.',
    },
  },
  create(context) {
    const options = /** @type {BoundaryOptions} */ (context.options[0]);
    const file = toPosix(path.relative(context.cwd, context.filename));
    /** @param {import('estree').Node} node @param {unknown} value */
    const check = (node, value) => {
      if (typeof value !== 'string') return;
      const v = boundaryViolation(file, value, options);
      if (v?.kind === 'deep')
        context.report({ node, messageId: 'deep', data: { source: value, entry: v.entry } });
      if (v?.kind === 'layer')
        context.report({ node, messageId: 'layer', data: { source: value, layer: v.layer } });
    };
    return {
      ImportDeclaration: (node) => check(node.source, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node.source, node.source.value),
      ExportAllDeclaration: (node) => check(node.source, node.source.value),
      ImportExpression: (node) => node.source.type === 'Literal' && check(node.source, node.source.value),
    };
  },
};
