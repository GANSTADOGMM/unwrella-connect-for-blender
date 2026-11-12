import http from 'node:http';
import { isIP } from 'node:net';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(root, 'public');
// JSON can escape one input byte as six ASCII bytes.
const maxBody = 60 * 1024 * 1024 + 64 * 1024;
let running = 0;
const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };

function runWorker(dir, signal, spawnWorker) {
  return new Promise((resolvePromise, reject) => {
    if (signal.aborted) return reject(new Error('Client disconnected'));
    const child = spawnWorker(process.env.BLENDER_PYTHON || 'python3', [join(root, 'unwrap.py'), dir], { cwd: dir, env: { ...process.env, HOME: dir }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    const stop = () => child.kill('SIGKILL');
    signal.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(stop, 120000);
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => { cleanup(); code === 0 && !signal.aborted ? resolvePromise() : reject(new Error(stderr || 'Unwrap process failed')); });
  });
}

function readBody(req, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    const cleanup = () => { clearTimeout(timer); req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onAborted); };
    const stopReading = status => { cleanup(); req.once('error', () => {}); req.resume(); resolvePromise({ status }); };
    const onData = chunk => {
      size += chunk.length;
      if (size > maxBody) return stopReading(413);
      chunks.push(chunk);
    };
    const onEnd = () => { cleanup(); resolvePromise({ body: Buffer.concat(chunks).toString('utf8') }); };
    const onError = error => { cleanup(); reject(error); };
    const onAborted = () => { req.once('error', () => {}); onError(new Error('Client disconnected')); };
    const timer = setTimeout(() => stopReading(408), timeoutMs);
    req.on('data', onData); req.on('end', onEnd); req.on('error', onError); req.on('aborted', onAborted);
  });
}

async function unwrap(req, res, uploadTimeoutMs, spawnWorker) {
  if (running >= 2) { req.resume(); return send(res, 503, { error: 'The unwrap engine is busy. Please try again.' }); }
  running++;
  const controller = new AbortController();
  const onClose = () => { if (!res.writableFinished) controller.abort(); };
  res.on('close', onClose);
  let dir;
  try {
    const upload = await readBody(req, uploadTimeoutMs);
    if (upload.status) {
      res.setHeader('Connection', 'close');
      res.once('finish', () => { if (!req.complete) req.destroy(); });
      return send(res, upload.status, { error: upload.status === 413 ? 'File is too large. The limit is 10 MB.' : 'Upload timed out. Please try again.' });
    }
    const data = JSON.parse(upload.body);
    if (!data || typeof data.obj !== 'string' || Buffer.byteLength(data.obj) > 10 * 1024 * 1024 || !/^\s*v\s/m.test(data.obj) || !/^\s*f\s/m.test(data.obj)) {
      return send(res, 400, { error: 'Please upload a valid OBJ file with vertices and faces (up to 10 MB).' });
    }
    const { angle, margin, areaWeight } = data.settings || {};
    if (![angle, margin, areaWeight].every(Number.isFinite) || angle < 1 || angle > 89 || margin < 0 || margin > 0.2 || areaWeight < 0 || areaWeight > 1) {
      return send(res, 400, { error: 'Invalid unwrap settings.' });
    }
    dir = await mkdtemp(join(tmpdir(), 'unwrella-'));
    // OBJ material libraries can reference arbitrary files. Geometry and UVs are self-contained.
    const safeObj = data.obj.replace(/^\s*mtllib\s+.*$/gim, '');
    await Promise.all([writeFile(join(dir, 'input.obj'), safeObj), writeFile(join(dir, 'settings.json'), JSON.stringify({ angle, margin, areaWeight }))]);
    await runWorker(dir, controller.signal, spawnWorker);
    const obj = await readFile(join(dir, 'output.obj'), 'utf8');
    if (!controller.signal.aborted) return send(res, 200, { obj });
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error('Unwrap failed:', error.message);
      if (!res.destroyed) return send(res, error instanceof SyntaxError ? 400 : 500, { error: error instanceof SyntaxError ? 'Invalid request.' : 'Could not unwrap this OBJ. Check that it contains valid mesh faces and try again.' });
    }
  } finally {
    res.off('close', onClose);
    try { if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 2 }); }
    catch (error) { console.error('Temporary cleanup failed:', error.message); }
    finally { running--; }
  }
}

function isLocalHost(authority) {
  if (typeof authority !== 'string') return false;
  const match = authority.match(/^(?:\[([0-9a-fA-F:]+)\]|([^:[\]\s/?#@\\]+))(?::([0-9]+))?$/);
  if (!match || (match[3] !== undefined && Number(match[3]) > 65535)) return false;
  if (match[1]) {
    return isIP(match[1]) === 6 && new URL(`http://[${match[1]}]`).hostname === '[::1]';
  }
  const hostname = match[2].toLowerCase();
  return hostname === 'localhost' || (isIP(hostname) === 4 && hostname.startsWith('127.'));
}

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
export function createServer({ uploadTimeoutMs = 30000, spawnWorker = spawn } = {}) {
  return http.createServer(async (req, res) => {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; }
    catch { return send(res, 400, { error: 'Invalid request target.' }); }
    if (req.method === 'POST' && pathname === '/api/unwrap') {
      const origin = req.headers.origin;
      if (!process.env.PUBLIC_ORIGIN && !isLocalHost(req.headers.host)) {
        req.resume(); return send(res, 403, { error: 'Host not allowed.' });
      }
      const expectedOrigin = process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
      if ((origin && origin !== expectedOrigin) || req.headers['sec-fetch-site'] === 'cross-site') {
        req.resume(); return send(res, 403, { error: 'Cross-site requests are not allowed.' });
      }
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
        req.resume(); return send(res, 415, { error: 'Content-Type must be application/json.' });
      }
      return unwrap(req, res, uploadTimeoutMs, spawnWorker);
    }
    if (req.method === 'GET' && pathname === '/api/health') return send(res, 200, { status: 'ok' });
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
    const isVendor = pathname.startsWith('/vendor/three/');
    const base = isVendor ? join(root, 'node_modules', 'three') : publicRoot;
    const relative = isVendor ? pathname.slice('/vendor/three/'.length) : pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = resolve(base, relative);
    if (!file.startsWith(base + sep)) return send(res, 404, { error: 'Not found' });
    try {
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const extension = file.slice(file.lastIndexOf('.'));
      res.setHeader('Content-Type', types[extension] || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const stream = createReadStream(file);
      stream.on('error', error => {
        console.error('Static file read failed:', error.message);
        if (res.headersSent) res.destroy(); else send(res, 500, { error: 'Could not read file.' });
      });
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch { send(res, 404, { error: 'Not found' }); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => console.log(`Unwrella Studio listening on ${host}:${port}`));
}
