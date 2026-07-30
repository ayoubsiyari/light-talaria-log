import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');

function resolveFile(absNoExt) {
  const candidates = [
    absNoExt,
    `${absNoExt}.ts`,
    `${absNoExt}.tsx`,
    `${absNoExt}.js`,
    path.join(absNoExt, 'index.ts'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return `${absNoExt}.ts`;
}

/**
 * Resolve `@/` → `src/` for node:test without adding a bundler dependency.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const abs = resolveFile(path.join(root, 'src', specifier.slice(2)));
    return nextResolve(pathToFileURL(abs).href, context);
  }
  // Also rewrite extensionless relative imports that TypeScript emits style
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !path.extname(specifier) &&
    context.parentURL
  ) {
    const parentDir = path.dirname(new URL(context.parentURL).pathname);
    const abs = resolveFile(path.resolve(parentDir, specifier));
    if (fs.existsSync(abs)) {
      return nextResolve(pathToFileURL(abs).href, context);
    }
  }
  return nextResolve(specifier, context);
}
