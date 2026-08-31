// Bundle budget enforcement — run after `npm run build` (postbuild prune included).
// Budgets are measured-basis (see docs/PLAN.md Task 7.1); every JS chunk must be
// claimed by a category or stay under the unbudgeted ceiling, so a renamed chunk
// can never silently dodge its budget.
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const astroDir = join(dist, '_astro');

const CATEGORIES = [
  {
    name: 'three + react-three-fiber',
    pattern: /use-render-gate|react-three-fiber|three\./i,
    maxGz: 300_000,
  },
  { name: 'react-dom client', pattern: /^client\./, maxGz: 65_000 },
  { name: 'gsap motion (lazy)', pattern: /^motion\./, maxGz: 50_000 },
  { name: 'bloom (lazy, full tier only)', pattern: /^bloom\./, maxGz: 60_000 },
  { name: 'layout worker', pattern: /layout.worker/, maxGz: 15_000 },
  {
    name: 'island shells + scheduler',
    pattern: /^(SkillGraph|HeroScene|scheduler)\./,
    maxGz: 30_000,
  },
];
const UNBUDGETED_MAX_GZ = 40_000; // any other single JS chunk
const PAGE_SCRIPTS_MAX_GZ = 25_000; // sum of all unbudgeted JS (page scripts etc.)
const TOTAL_JS_MAX_GZ = 500_000;
const CSS_MAX_GZ = 30_000;
const MORPH_BIN_MAX_RAW = 950_000;

const gz = (file) => gzipSync(readFileSync(file)).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`  ✗ ${msg}`);
};

const files = readdirSync(astroDir);
const js = files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
const css = files.filter((f) => f.endsWith('.css'));

const rows = [];
let totalJs = 0;
let unbudgetedSum = 0;

for (const f of js) {
  const size = gz(join(astroDir, f));
  totalJs += size;
  const cat = CATEGORIES.find((c) => c.pattern.test(f));
  if (cat) {
    rows.push({ file: f, size, budget: cat.maxGz, name: cat.name });
    if (size > cat.maxGz) fail(`${f} (${cat.name}): ${kb(size)} > budget ${kb(cat.maxGz)}`);
  } else {
    rows.push({ file: f, size, budget: UNBUDGETED_MAX_GZ, name: 'unbudgeted' });
    unbudgetedSum += size;
    if (size > UNBUDGETED_MAX_GZ)
      fail(
        `${f}: unbudgeted chunk ${kb(size)} > ${kb(UNBUDGETED_MAX_GZ)} — claim it in CATEGORIES`,
      );
  }
}

rows.sort((a, b) => b.size - a.size);
console.log('bundle budgets (gzip):');
for (const r of rows) {
  console.log(
    `  ${r.size > r.budget ? '✗' : '✓'} ${kb(r.size).padStart(9)} / ${kb(r.budget).padStart(9)}  ${r.file}  [${r.name}]`,
  );
}

const cssTotal = css.reduce((s, f) => s + gz(join(astroDir, f)), 0);
console.log(`  css total: ${kb(cssTotal)} / ${kb(CSS_MAX_GZ)}`);
if (cssTotal > CSS_MAX_GZ) fail(`css total ${kb(cssTotal)} > ${kb(CSS_MAX_GZ)}`);

console.log(`  page-script (unbudgeted) total: ${kb(unbudgetedSum)} / ${kb(PAGE_SCRIPTS_MAX_GZ)}`);
if (unbudgetedSum > PAGE_SCRIPTS_MAX_GZ)
  fail(`unbudgeted js total ${kb(unbudgetedSum)} > ${kb(PAGE_SCRIPTS_MAX_GZ)}`);

console.log(`  js total: ${kb(totalJs)} / ${kb(TOTAL_JS_MAX_GZ)}`);
if (totalJs > TOTAL_JS_MAX_GZ) fail(`js total ${kb(totalJs)} > ${kb(TOTAL_JS_MAX_GZ)}`);

const bin = join(dist, 'morph-targets.bin');
const binSize = statSync(bin).size;
console.log(`  morph-targets.bin: ${kb(binSize)} / ${kb(MORPH_BIN_MAX_RAW)} (raw)`);
if (binSize > MORPH_BIN_MAX_RAW)
  fail(`morph-targets.bin ${kb(binSize)} > ${kb(MORPH_BIN_MAX_RAW)}`);

if (failed) {
  console.error('bundle budgets: FAILED');
  process.exit(1);
}
console.log('bundle budgets: OK');
