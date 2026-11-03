import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function createStaticHandler(rootDir) {
  const root = path.resolve(rootDir);

  return async function serveStatic(req, res, urlPath) {
    let relative = decodeURIComponent(urlPath.split('?')[0]);
    if (relative === '/' || relative === '') relative = '/index.html';

    const target = path.resolve(root, `.${relative}`);
    if (!target.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return true;
    }

    let info;
    try {
      info = await stat(target);
    } catch {
      return false;
    }
    if (info.isDirectory()) return false;

    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
    });

    if (req.method === 'HEAD') {
      res.end();
      return true;
    }

    createReadStream(target).pipe(res);
    return true;
  };
}
