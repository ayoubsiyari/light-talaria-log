#!/usr/bin/env node
/**
 * CI guard: Math.random / Date.now / new Date() are banned inside src/orders/
 * except journal.ts (display timestamps only).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'src', 'orders');
const banned = [
  { re: /\bMath\.random\s*\(/, label: 'Math.random(' },
  { re: /\bDate\.now\s*\(/, label: 'Date.now(' },
  { re: /\bnew\s+Date\s*\(/, label: 'new Date(' },
];

const allowDateIn = new Set(['journal.ts']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === '__tests__') continue;
      walk(p, out);
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

let failed = false;
for (const file of walk(root)) {
  const base = path.basename(file);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    for (const b of banned) {
      if (!b.re.test(line)) continue;
      if ((b.label.startsWith('Date') || b.label.startsWith('new Date')) && allowDateIn.has(base)) {
        continue;
      }
      console.error(`${path.relative(process.cwd(), file)}:${i + 1}: banned ${b.label}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('orders determinism check FAILED');
  process.exit(1);
}
console.log('orders determinism check OK');
