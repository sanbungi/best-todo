import http from 'node:http';
import { readFileSync } from 'node:fs';
const files = new Set(['index.html', 'app.js', 'task-utils.js', 'reorder.js', 'style.css']);
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (req.method !== 'GET' || !files.has(name)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, {
    'Content-Type': name.endsWith('.js')
      ? 'text/javascript; charset=utf-8'
      : name.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src https: http:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'Referrer-Policy': 'no-referrer',
  });
  res.end(readFileSync(new URL('../public/' + name, import.meta.url)));
});
server.listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1', () =>
  console.log(`Frontend: http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`),
);
