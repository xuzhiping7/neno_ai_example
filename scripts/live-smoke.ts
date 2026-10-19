import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { byId } from '../shared/catalog';
import { SSEParser, type StreamEvent } from '../src/lib/sse';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:7777';
const results: { endpoint: string; status: number; note?: string }[] = [];
async function call(id: string, values: Record<string, string> = {}, body?: unknown, expected?: number) {
  const endpoint = byId[id]; const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof FormData || typeof body === 'string') payload = body;
  else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const response = await fetch(`${base}/gateway/${id}?${new URLSearchParams(values)}`, { method: endpoint.method, headers, body: payload, signal: AbortSignal.timeout(60000) });
  const bytes = new Uint8Array(await response.arrayBuffer()); const text = new TextDecoder().decode(bytes);
  let data: any = text; if (response.headers.get('content-type')?.includes('json')) data = text ? JSON.parse(text) : null;
  results.push({ endpoint: id, status: response.status, ...(response.ok ? {} : { note: data?.error?.code || 'HTTP error' }) });
  console.log(`${id}: ${response.status}${data?.error?.code ? ` ${data.error.code}` : ''}`);
  assert.equal(response.status, expected ?? (endpoint.method === 'DELETE' && id === 'task-delete' ? 204 : endpoint.method === 'POST' && ['task-create', 'comment-create', 'file-put', 'file-upload'].includes(id) ? 201 : 200), `${id}: ${text.slice(0, 250)}`);
  return { data, bytes, headers: response.headers };
}
const stamp = Date.now(); const path = `developer-demo/workbench-check-${stamp}.md`;
let taskId = '';
try {
  await call('project'); const agents = (await call('agents')).data.agents; await call('board'); await call('tasks', { stage: 'active', offset: '0', limit: '2' });
  await call('files', { path: '', recursive: 'false' });
  const first = '# 小能 AI API 验证文件\n\n由开发者工作台验收创建，用于文件读写演示。\n';
  const form = new FormData(); form.append('file', new Blob([first], { type: 'text/plain' }), 'check.md'); form.append('path', path);
  const file = (await call('file-upload', {}, form)).data;
  await call('file-metadata', {}, { paths: [path, 'developer-demo/not-present.md', '../invalid'] });
  const read = await call('file-read', { path }); assert.equal(read.data, first); const version = read.headers.get('x-file-key'); assert.ok(version);
  const second = first + '\n第二次保存：条件覆盖验证通过。\n';
  await call('file-put', { path, expect_key: version }, second);
  await call('file-put', { path, expect_key: version }, 'This stale version must not overwrite the file.', 409);
  assert.equal(new TextDecoder().decode((await call('file-download', { path })).bytes), second);
  assert.equal(new TextDecoder().decode((await call('file-by-id', { fileId: file.id })).bytes), second);
  const versions = (await call('file-versions', { fileId: file.id })).data.versions;
  if (versions.length) { const old = await call('file-version-download', { fileId: file.id, versionId: versions[0].id }); assert.equal(new TextDecoder().decode(old.bytes), first); }
  else results.push({ endpoint: 'file-version-download', status: 0, note: '项目未产生历史版本；通过隔离代理测试验证路由和二进制传输。' });
  const request = { title: `API 工作台验收 ${stamp}`, task_type: 'technical', description: '自动验收的临时任务，不指派助理，验证后删除。', client_request_id: randomUUID(), wait_approval: true };
  const task = (await call('task-create', {}, request)).data; taskId = task.id;
  assert.equal((await call('task-create', {}, request)).data.id, taskId, 'idempotent task creation');
  await call('task', { taskId });
  const comment = (await call('comment-create', { taskId }, { body: '自动验收评论', author_name: '工作台验收', file_refs: [path] })).data;
  await call('comments', { taskId, limit: '1' }); await call('comment-edit', { taskId, commentId: comment.id }, { body: '评论编辑验证通过', file_refs: [path] });
  await call('comment-detach', { taskId, commentId: comment.id, path });
  await call('task-start', { taskId }); await call('task-transition', { taskId }, { to_stage: 'review' }); await call('task-accept', { taskId }, {}); await call('task-archive', { taskId });
  await call('tasks', { stage: 'archived', limit: '2', offset: '0' }); await call('task-delete', { taskId }); taskId = '';
  await call('conversations');
  await call('key-status', { projectId: 'missing-owner-token' }, undefined, 503);
  if (process.env.RUN_LIVE_CHAT === '1') {
    const agent = agents.find((item: any) => item.name === '周报助理') || agents[0];
    assert.ok(agent, 'project has an assistant');
    const events: StreamEvent[] = []; let receipt: any;
    const parser = new SSEParser(event => { events.push(event); if (event.event === 'accepted') receipt = event.data; });
    const response = await fetch(`${base}/gateway/chat?agentId=${agent.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '这是一条 API 连通性测试。不要调用任何工具，不要修改文件，不要通知他人。请只回复“小能 API 连接成功”。', stream: true, effort: 'low', client_request_id: randomUUID() }), signal: AbortSignal.timeout(90000) });
    assert.equal(response.status, 200); const reader = response.body!.getReader(); while (true) { const chunk = await reader.read(); if (chunk.done) break; parser.feed(chunk.value); } parser.finish();
    results.push({ endpoint: 'chat', status: response.status, note: `SSE events: ${events.map(event => event.event).join(', ')}` }); console.log('chat: 200 SSE');
    assert.ok(receipt?.turn_id); assert.ok(events.some(event => event.event === 'turn_end'));
    await call('turn', { turnId: receipt.turn_id }); await call('messages', { conversationId: receipt.conversation_id }); await call('pending-question', { conversationId: receipt.conversation_id }); await call('tool-calls', { conversationId: receipt.conversation_id, pending: 'true' }); await call('vm-jobs', { turnId: receipt.turn_id }); await call('stream', { turnId: receipt.turn_id, since: '0' });
  }
} finally {
  if (taskId) { try { await call('task-delete', { taskId }); } catch { console.log(`Cleanup pending for newly created task ${taskId}`); } }
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/live-api-report.json', JSON.stringify({ generated: new Date().toISOString(), sampleFile: path, results }, null, 2));
}
console.log(`Completed ${results.length} checks. Report: artifacts/live-api-report.json`);
