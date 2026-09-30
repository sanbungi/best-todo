import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Both the browser server and Electron serve the same public/ tree.
export function createFrontendServer() {
  return http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const name = pathname === '/' ? 'index.html' : pathname.slice(1);
      const filename = path.resolve(publicDir, name);
      const relative = path.relative(publicDir, filename);
      if (
        !['GET', 'HEAD'].includes(req.method) ||
        relative.startsWith('..') ||
        path.isAbsolute(relative) ||
        name.split(/[\\/]/).some((part) => part.startsWith('.')) ||
        !types[path.extname(filename)]
      ) {
        res.writeHead(404);
        return res.end();
      }
      const content = await readFile(filename);
      res.writeHead(200, {
        'Content-Type': types[path.extname(filename)],
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src https: http:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        'Referrer-Policy': 'no-referrer',
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
}
