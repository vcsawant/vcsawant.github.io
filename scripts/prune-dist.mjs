// Post-build prune: R&D spike routes (/rnd/*) are dev-only — remove them and any
// _astro assets that nothing else references, so spikes never ship to production.
// Runs automatically via the npm "postbuild" hook.
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = join(process.cwd(), 'dist');
const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.xml']);

rmSync(join(dist, 'rnd'), { recursive: true, force: true });

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const all = walk(dist);
const astroAssets = all.filter((f) => relative(dist, f).startsWith('_astro/'));
const isText = (f) => TEXT.has(f.slice(f.lastIndexOf('.')));

// Mark _astro files reachable from non-_astro roots, transitively (hashed basenames
// are unique, so substring search is sufficient).
const roots = all.filter((f) => !relative(dist, f).startsWith('_astro/') && isText(f));
const reachable = new Set();
let frontier = roots;
while (frontier.length > 0) {
  const contents = frontier.map((f) => readFileSync(f, 'utf8')).join('\n');
  frontier = astroAssets.filter(
    (a) => !reachable.has(a) && contents.includes(a.slice(a.lastIndexOf('/') + 1)),
  );
  frontier.forEach((a) => reachable.add(a));
  frontier = frontier.filter(isText);
}

const orphans = astroAssets.filter((a) => !reachable.has(a));
orphans.forEach((f) => rmSync(f));
console.log(`prune-dist: removed dist/rnd and ${orphans.length} unreferenced _astro asset(s)`);
