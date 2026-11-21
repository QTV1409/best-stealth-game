// A tiny static server for game/ (Node 22, standard library only), so the
// entry can be played locally without a build step:
//   node serve.ts
// serves game/ on http://localhost:8080. It only serves files under game/
// and only the types a browser game needs; this is a development
// convenience, not a web server for the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const port = 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(join(root, normalize(path).replace(/^(\.\.[/\\])+/, '')));
  if (!file.startsWith(root + sep) && file !== root) {
    response.writeHead(403); response.end('forbidden'); return;
  }
  const target = file === root ? join(root, 'index.html') : file;
  let stat;
  try {
    stat = statSync(target);
  } catch {
    response.writeHead(404); response.end('not found'); return;
  }
  if (!stat.isFile()) {
    response.writeHead(404); response.end('not found'); return;
  }
  response.writeHead(200, { 'content-type': MIME[extname(target)] || 'application/octet-stream' });
  createReadStream(target).pipe(response);
}).listen(port, () => {
  console.log('Moonpearl Heist at http://localhost:' + port);
});
