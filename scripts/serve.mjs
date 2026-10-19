import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.argv[2] || process.env.PORT || 4173);
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.avif':'image/avif', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let requested = decodeURIComponent(url.pathname).replace(/^\/lantern-rush(?=\/)/, '');
    const file = path.resolve(root, '.' + requested + (requested.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`LANTERN RUSH ready: http://localhost:${port}/`));
