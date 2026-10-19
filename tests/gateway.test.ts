import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app';
import { loadConfig, type Config } from '../server/config';
import { endpoints, resolveEndpoint, byId } from '../shared/catalog';

let upstream: Server; let service: Server; let base: string; let directory: string;
const secret = 'npk_test_fixture_NOT_A_REAL_KEY';
let seen: { method?: string; url?: string; auth?: string; type?: string; body: Buffer; cursor?: string };
let config: Config;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'neno-gateway-'));
  upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    seen = { method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers['content-type'], body: Buffer.concat(chunks), cursor: req.headers['last-event-id'] as string };
    if (req.url?.includes('/stream')) { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('id: 7\nevent: text\ndata: {"delta":"first"}\n\n'); setTimeout(() => res.end('event: turn_end\ndata: {"status":"done"}\n\n'), 300); return; }
    if (req.url?.includes('/files/read')) { res.writeHead(200, { 'Content-Type': 'text/plain', 'X-File-Key': 'opaque-v2' }); res.end('{ "keep": "exact spacing" }\r\n'); return; }
    if (req.url?.includes('/files/download')) { res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="sample.bin"' }); res.end(Buffer.from([0, 255, 128, 13, 10])); return; }
    if (req.method === 'DELETE') { res.writeHead(204); res.end(); return; }
    res.writeHead(req.method === 'POST' ? 201 : 200, { 'Content-Type': 'application/json', 'Retry-After': '2' }); res.end(JSON.stringify({ ok: true }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const address = upstream.address() as { port: number };
  config = { host: '127.0.0.1', port: 7777, upstream: `http://127.0.0.1:${address.port}`, apiKey: secret, ownerToken: '', docsUrl: 'http://localhost:8888', timeout: 10000 };
  service = createApp(config, { envFile: join(directory, '.env') }).listen(0, '127.0.0.1'); await once(service, 'listening');
  base = `http://127.0.0.1:${(service.address() as { port: number }).port}`;
});
after(async () => { service?.closeAllConnections(); upstream?.closeAllConnections(); await Promise.all([new Promise<void>(resolve => service.close(() => resolve())), new Promise<void>(resolve => upstream.close(() => resolve()))]); await rm(directory, { recursive: true, force: true }); });
const call = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, init);

test('36 documented routes are unique and resolve paths without permitting traversal', () => {
  assert.equal(endpoints.length, 36); assert.equal(endpoints.filter(e => !e.owner).length, 35);
  assert.equal(new Set(endpoints.map(e => `${e.method} ${e.path}`)).size, 36);
  assert.equal(resolveEndpoint(byId['file-read'], { path: '资料/a & b+#.md' }), '/api/v1/ext/files/read?path=%E8%B5%84%E6%96%99%2Fa+%26+b%2B%23.md');
  assert.throws(() => resolveEndpoint(byId.task, { taskId: '../project' }));
  assert.throws(() => resolveEndpoint(byId.task, { taskId: '' }));
});
test('API and configuration work without a session while keys remain server-side', async () => {
  assert.equal(loadConfig({}).port, 7777);
  const project = await fetch(`${base}/gateway/project`);
  assert.equal(project.status, 200);
  assert.equal(project.headers.get('set-cookie'), null);
  const saved = await fetch(`${base}/workbench/config`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiHost: 'http://127.0.0.1', apiPort: Number(new URL(config.upstream).port), apiKey: '', docsUrl: config.docsUrl, ownerToken: '' }),
  });
  assert.equal(saved.status, 200);
  const response = await fetch(`${base}/workbench/config`); const text = await response.text();
  assert.equal(text.includes(secret), false);
  assert.equal('authenticated' in JSON.parse(text), false);
  assert.equal((await fetch(`${base}/workbench/session`, { method: 'POST' })).status, 404);
});
test('Proxy injects server credential and preserves encoded paths, upstream status and headers', async () => {
  const response = await call('/gateway/file-read?path=%E8%B5%84%E6%96%99%2Fa+%26+b%2B%23.md', { headers: { Authorization: 'Bearer malicious-client-key' } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-file-key'), 'opaque-v2');
  assert.equal(await response.text(), '{ "keep": "exact spacing" }\r\n');
  assert.equal(seen.auth, `Bearer ${secret}`); assert.equal(new URL(seen.url!, 'http://test').searchParams.get('path'), '资料/a & b+#.md');
});
test('Raw upload bytes and multipart boundaries arrive unchanged', async () => {
  const raw = Buffer.from([0, 255, 7, 13, 10, 128]);
  const response = await call('/gateway/file-put?path=binary.bin&expect_key=opaque-v1', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: raw });
  assert.equal(response.status, 201); assert.deepEqual(seen.body, raw); assert.match(seen.url!, /expect_key=opaque-v1/);
  const form = new FormData(); form.append('file', new Blob(['hello']), 'hello.txt'); form.append('path', 'demo/hello.txt');
  assert.equal((await call('/gateway/file-upload', { method: 'POST', body: form })).status, 201);
  assert.match(seen.type!, /^multipart\/form-data; boundary=/); assert.match(seen.body.toString(), /demo\/hello.txt/); assert.match(seen.body.toString(), /filename="hello.txt"/);
});
test('Binary downloads and bodyless deletions are not JSON wrapped', async () => {
  const response = await call('/gateway/file-download?path=binary.bin');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([0, 255, 128, 13, 10])); assert.match(response.headers.get('content-disposition')!, /sample.bin/);
  const deletion = await call('/gateway/task-delete?taskId=task-1', { method: 'DELETE' }); assert.equal(deletion.status, 204); assert.equal(await deletion.text(), '');
});
test('SSE is delivered before stream completion and forwards the resume cursor', async () => {
  const response = await call('/gateway/stream?turnId=turn-1&since=6', { headers: { 'Last-Event-ID': '6' } });
  const reader = response.body!.getReader();
  const first = await reader.read(); assert.match(new TextDecoder().decode(first.value), /first/); assert.doesNotMatch(new TextDecoder().decode(first.value), /turn_end/);
  const final = await reader.read(); assert.match(new TextDecoder().decode(final.value), /turn_end/); await reader.cancel();
  assert.equal(seen.cursor, '6'); assert.match(seen.url!, /since=6/);
});
test('All project endpoints are callable through the allowlisted gateway', async () => {
  for (const endpoint of endpoints.filter(e => !e.owner)) {
    const query = new URLSearchParams((endpoint.fields || []).map(f => [f.name, f.in === 'path' ? 'fixture-id' : f.name === 'path' ? 'sample.txt' : f.default || '']));
    const response = await call(`/gateway/${endpoint.id}?${query}`, { method: endpoint.method, ...(endpoint.input ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}) });
    assert.ok(response.ok, `${endpoint.id}: ${response.status}`); await response.arrayBuffer();
    assert.equal(seen.method, endpoint.method);
  }
});
test('Unknown routes, wrong methods, repeated path parameters and cross-site calls are blocked', async () => {
  assert.equal((await call('/gateway/anything')).status, 404);
  assert.equal((await call('/gateway/project', { method: 'POST' })).status, 404);
  assert.equal((await call('/gateway/task?taskId=first&taskId=second')).status, 400);
  assert.equal((await call('/gateway/project', { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  assert.equal((await call('/gateway/project', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
});
test('Owner-only endpoint does not substitute a project key for a login token', async () => {
  const response = await call('/gateway/key-status?projectId=project-1'); assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'owner_token_required');
});
test('Configuration is persisted, credentials remain write-only and changing hosts requires a new key', async () => {
  const current = new URL(config.upstream);
  const values = { apiHost: 'http://127.0.0.1', apiPort: Number(current.port), apiKey: '', docsUrl: 'http://localhost:8888', ownerToken: '' };
  const save = (value: unknown) => call('/workbench/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  assert.equal((await save({ ...values, apiPort: 9999 })).status, 400);
  assert.equal((await save({ ...values, apiHost: 'file:///etc/passwd' })).status, 400);
  assert.equal((await save(values)).status, 200);
  const file = await readFile(join(directory, '.env'), 'utf8'); assert.ok(file.includes(secret));
  const visible = await (await call('/workbench/config')).text(); assert.ok(!visible.includes(secret));
});

test('An empty installation can save its first connection without a docs URL', async () => {
  const empty = loadConfig({});
  const envFile = join(directory, 'first-run.env');
  const firstRun = createApp(empty, { envFile }).listen(0, '127.0.0.1');
  await once(firstRun, 'listening');
  const url = `http://127.0.0.1:${(firstRun.address() as { port: number }).port}`;
  try {
    const initial = await (await fetch(`${url}/workbench/config`)).json();
    assert.equal(initial.apiHost, ''); assert.equal(initial.apiBase, ''); assert.equal(initial.apiPort, null);
    assert.equal(initial.docsUrl, ''); assert.equal(initial.apiConfigured, false);
    const notConfigured = await fetch(`${url}/gateway/project`);
    assert.equal(notConfigured.status, 503);
    assert.equal((await notConfigured.json()).error.code, 'api_not_configured');
    const values = { apiHost: 'http://127.0.0.1', apiPort: Number(new URL(config.upstream).port), apiKey: secret, docsUrl: '', ownerToken: '' };
    const saved = await fetch(`${url}/workbench/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    assert.equal(saved.status, 200);
    const current = await (await fetch(`${url}/workbench/config`)).json();
    assert.equal(current.apiConfigured, true); assert.equal(current.docsUrl, '');
    assert.equal((await fetch(`${url}/gateway/project`)).status, 200);
    const persisted = await readFile(envFile, 'utf8');
    assert.match(persisted, /NENO_DOCS_URL=""/);
  } finally {
    firstRun.closeAllConnections();
    await new Promise<void>(resolve => firstRun.close(() => resolve()));
  }
});
