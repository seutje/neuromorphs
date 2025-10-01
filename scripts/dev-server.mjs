#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, normalize, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const BASE_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store'
};

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm'
};

function sendText(res, statusCode, message) {
  const body = Buffer.from(String(message));
  res.writeHead(statusCode, {
    ...BASE_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length
  });
  res.end(body);
}

function resolvePath(requestPath) {
  let pathname = decodeURIComponent(requestPath);
  if (!pathname || pathname === '/') {
    pathname = '/index.html';
  }
  if (pathname.endsWith('/')) {
    pathname += 'index.html';
  }
  const normalized = normalize(`.${pathname}`);
  const resolved = resolve(ROOT, normalized);
  if (!resolved.startsWith(ROOT)) {
    return null;
  }
  return resolved;
}

const server = createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed');
    return;
  }
  if (!req.url) {
    sendText(res, 400, 'Bad Request');
    return;
  }
  const resolvedPath = resolvePath(new URL(req.url, `http://${req.headers.host ?? 'localhost'}`).pathname);
  if (!resolvedPath) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  let filePath = resolvedPath;
  try {
    let fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = resolve(filePath, 'index.html');
      fileStat = await stat(filePath);
    }
    const extension = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] ?? 'application/octet-stream';
    res.writeHead(200, {
      ...BASE_HEADERS,
      'Content-Type': contentType,
      'Content-Length': fileStat.size
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(filePath);
    stream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        sendText(res, 500, 'Internal Server Error');
      } else {
        res.destroy(error);
      }
    });
    stream.pipe(res);
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      sendText(res, 404, 'Not Found');
      return;
    }
    console.error('Failed to serve request:', error);
    sendText(res, 500, 'Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Dev server running at http://${displayHost}:${PORT}`);
  console.log('COOP/COEP headers enabled for SharedArrayBuffer support.');
});
