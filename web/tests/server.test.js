import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../server.js';

const server = createServer({ uploadTimeoutMs: 3000 });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const post = data => fetch(`${base}/api/unwrap`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
const settings = { angle: 66, margin: 0.02, areaWeight: 0 };
const triangle = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';

test('serves the workspace and health endpoint', async () => {
  assert.equal((await fetch(base)).status, 200);
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), {status:'ok'});
});
test('rejects malformed request targets and stays available', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = http.request({ hostname:'127.0.0.1', port:server.address().port, path:'//' }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.end();
  });
  assert.equal(status, 400);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});
test('rejects malformed geometry and invalid settings', async () => {
  assert.equal((await post({obj:'hello',settings})).status,400);
  assert.equal((await post(null)).status,400);
  assert.equal((await post({obj:triangle,settings:{...settings, angle:100}})).status,400);
});
test('rejects cross-site and non-JSON unwrap requests', async () => {
  const options = { method:'POST', headers:{'Content-Type':'application/json', 'Origin':'https://attacker.example'}, body:JSON.stringify({obj:triangle,settings}) };
  assert.equal((await fetch(`${base}/api/unwrap`, options)).status, 403);
  options.headers.Origin = 'null';
  assert.equal((await fetch(`${base}/api/unwrap`, options)).status, 403);
  options.headers.Origin = base;
  options.body = '{}';
  assert.equal((await fetch(`${base}/api/unwrap`, options)).status, 400);
  assert.equal((await fetch(`${base}/api/unwrap`, {method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status, 415);
});
test('limits requests while their bodies are still uploading and releases the slots', async () => {
  const openUpload = () => {
    let req;
    const response = new Promise((resolve, reject) => {
      req = http.request(`${base}/api/unwrap`, { method:'POST', headers:{'Content-Type':'application/json'} }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.write('{');
    });
    return {req, response};
  };
  const first = openUpload(), second = openUpload();
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await post({obj:triangle,settings})).status, 503);
  } finally {
    first.req.end('}'); second.req.end('}');
    assert.deepEqual(await Promise.all([first.response, second.response]), [400, 400]);
  }
  assert.equal((await post({obj:'invalid',settings})).status, 400);
});
test('responds to oversized and stalled uploads', async () => {
  const oversized = await fetch(`${base}/api/unwrap`, { method:'POST', headers:{'Content-Type':'application/json'}, body:'x'.repeat(60 * 1024 * 1024 + 64 * 1024 + 1) });
  assert.equal(oversized.status, 413);
  const escaped = 'v 0 0 0\r\n'.repeat(1160000) + 'f 1 2 3\r\n';
  assert.ok(Buffer.byteLength(escaped) < 10 * 1024 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify({obj:escaped})) > 12 * 1024 * 1024);
  assert.equal((await post({obj:escaped, settings:{...settings, angle:100}})).status, 400);
  const timeoutStatus = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/api/unwrap`, { method:'POST', headers:{'Content-Type':'application/json'} }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.write('{');
  });
  assert.equal(timeoutStatus, 408);
  assert.equal((await post({obj:'invalid',settings})).status, 400);
});

test('releases a slot when a client abandons an upload', async () => {
  const req = http.request(`${base}/api/unwrap`, { method:'POST', headers:{'Content-Type':'application/json'} });
  req.on('error', () => {});
  req.write('{');
  await new Promise(resolve => setTimeout(resolve, 100));
  req.destroy();
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await post({obj:'invalid',settings})).status, 400);
});

test('terminates the worker after a client disconnects', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'unwrella-test-'));
  const script = join(temp, 'worker');
  const pidFile = join(temp, 'pid');
  const previousPython = process.env.BLENDER_PYTHON;
  await writeFile(script, '#!/usr/bin/env node\nrequire("fs").writeFileSync(process.env.STUB_PID_PATH, String(process.pid)); setInterval(() => {}, 1000);\n');
  await chmod(script, 0o755);
  process.env.BLENDER_PYTHON = script;
  process.env.STUB_PID_PATH = pidFile;
  let req;
  try {
    req = http.request(`${base}/api/unwrap`, { method:'POST', headers:{'Content-Type':'application/json'} });
    req.on('error', () => {});
    req.end(JSON.stringify({obj:triangle, settings}));
    let pid;
    for (let i=0; i<100 && !pid; i++) {
      try { pid = Number(await readFile(pidFile, 'utf8')); }
      catch { await new Promise(resolve => setTimeout(resolve, 20)); }
    }
    assert.ok(pid, 'worker started');
    req.destroy();
    let stopped = false;
    for (let i=0; i<100 && !stopped; i++) {
      try { process.kill(pid, 0); await new Promise(resolve => setTimeout(resolve, 20)); }
      catch (error) { if (error.code === 'ESRCH') stopped = true; else throw error; }
    }
    assert.ok(stopped, 'worker exited after disconnect');
  } finally {
    if (req) req.destroy();
    if (previousPython === undefined) delete process.env.BLENDER_PYTHON; else process.env.BLENDER_PYTHON = previousPython;
    delete process.env.STUB_PID_PATH;
    await rm(temp, { recursive:true, force:true });
  }
});
test('unwraps OBJ geometry into an OBJ with UVs', async () => {
  const response=await post({obj:triangle,settings});
  assert.equal(response.status,200);
  const {obj}=await response.json();
  assert.match(obj,/^vt\s/m);
  assert.match(obj,/^f\s+\d+\/\d+/m);
});
test.after(() => server.close());
