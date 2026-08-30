// Minimal foreground static server for dist/ — used by Playwright and Lighthouse CI.
// Mirrors the production Worker's semantics: trailing-slash HTML, 404 -> /404.html.
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '127.0.0.1';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.bin': 'application/octet-stream',
  '.ico': 'image/x-icon',
};

function resolve(url) {
  let decoded;
  try {
    decoded = decodeURIComponent(url.split('?')[0]);
  } catch {
    return { file: join(root, '404.html'), status: 404 };
  }
  const clean = normalize(decoded).replaceAll('..', '');
  const candidates = [
    join(root, clean),
    join(root, clean, 'index.html'),
    join(root, `${clean.replace(/\/$/, '')}.html`),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return { file: c, status: 200 };
  }
  return { file: join(root, '404.html'), status: 404 };
}

http
  .createServer((req, res) => {
    const { file, status } = resolve(req.url ?? '/');
    if (!existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(status, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  })
  .listen(port, host, () => {
    console.log(`serving dist/ at http://${host}:${port}`);
  });
