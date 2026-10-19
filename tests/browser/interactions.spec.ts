import { test, expect, type Page } from '@playwright/test';

async function fixture(page: Page, handler: (id: string, request: any) => { status?: number; data?: any; text?: string; type?: string; headers?: Record<string, string> }) {
  await page.route('**/workbench/config', route => route.fulfill({ json: { apiBase: 'http://api.test:8888/api/v1', apiHost: 'http://api.test', apiPort: 8888, docsUrl: 'http://docs.test', port: 7777, apiConfigured: true, keyConfigured: true, ownerConfigured: false, endpointCount: 36, projectEndpointCount: 35 } }));
  await page.route('**/gateway/**', async route => {
    const url = new URL(route.request().url()); const id = url.pathname.split('/').pop()!;
    const base = id === 'project' ? { data: { project: { id: 'project-1', name: '隔离交互测试' }, key: { expires_at: null } } } : id === 'agents' ? { data: { agents: [{ id: 'agent-1', name: '测试助理', role: '测试角色' }] } } : handler(id, route.request());
    await route.fulfill({ status: base.status || 200, contentType: base.type || 'application/json', headers: base.headers, body: base.text ?? JSON.stringify(base.data ?? {}) });
  });
}
test('Streaming chat renders returned questions, resumes answers, and requires explicit tool decisions', async ({ page }) => {
  let decided = false; const decisions: any[] = []; const answers: any[] = [];
  await fixture(page, (id, request) => {
    if (id === 'conversations') return { data: { conversations: [] } };
    if (id === 'chat') return { type: 'text/event-stream', text: 'event: accepted\ndata: {"conversation_id":"conv-1","turn_id":"turn-1","status":"running"}\n\nid: 7\nevent: text\ndata: {"delta":"先确认一个细节。"}\n\nevent: turn_end\ndata: {"status":"done","requires_action":true,"question":{"id":"question-1","question":"选择哪个环境？","options":[{"label":"测试环境"},{"label":"正式环境"}],"multi_select":false}}\n\n' };
    if (id === 'answer') { answers.push(request.postDataJSON()); return { status: 202, data: { conversation_id: 'conv-1', turn_id: 'turn-2', status: 'running' } }; }
    if (id === 'stream') return { type: 'text/event-stream', text: 'id: 11\nevent: text\ndata: {"delta":"已选择测试环境。"}\n\nevent: turn_end\ndata: {"status":"done","requires_action":false}\n\n' };
    if (id === 'tool-calls') return { data: { items: decided ? [] : [{ id: 'call-1', tool_name: 'fixture_tool', state: 'pending', arguments: { purpose: 'isolated test' } }] } };
    if (id === 'tool-decision') { decided = true; decisions.push(request.postDataJSON()); return { data: { ok: true } }; }
    if (id === 'cancel') return { data: { status: 'cancelled' } };
    if (id === 'turn') return { data: { turn: { id: 'turn-2', status: 'cancelled', conversation_id: 'conv-1' }, text: '已选择测试环境。' } };
    return { data: {} };
  });
  await page.goto('/#chat'); await page.getByLabel('对话消息').fill('请问我一个问题'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('heading', { name: '选择哪个环境？' })).toBeVisible();
  await page.getByLabel('测试环境', { exact: true }).check(); await page.getByRole('button', { name: '提交回答并继续' }).click();
  await expect(page.getByText('已选择测试环境。', { exact: true }).first()).toBeVisible();
  expect(answers).toEqual([{ question_id: 'question-1', selected: ['测试环境'], free_text: '' }]);
  await page.getByText('会话恢复与诊断', { exact: true }).click(); await page.getByRole('button', { name: '刷新工具授权', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'fixture_tool' })).toBeVisible(); expect(decisions).toEqual([]);
  await page.getByRole('button', { name: '允许本次调用', exact: true }).click(); expect(decisions).toEqual([{ allow: true }]);
  await page.getByRole('button', { name: '停止执行', exact: true }).click(); await expect(page.locator('.chat-diagnostic')).toContainText('cancelled');
});

test('File editor preserves exact text and keeps edits after a version conflict', async ({ page }) => {
  const original = '{ "spacing":  "must stay" }\r\n'; let sent: any;
  const file = { id: 'file-1', path: 'demo.json', name: 'demo.json', kind: 'file', size: 30, version: 'opaque-v1', content_type: 'file' };
  await fixture(page, (id, request) => {
    if (id === 'files') return { data: { files: [file], count: 1, complete: true } };
    if (id === 'file-read') return { text: original, type: 'text/plain', headers: { 'X-File-Key': 'opaque-v1' } };
    if (id === 'file-put') { sent = { url: request.url(), body: request.postData() }; return { status: 409, data: { error: { code: 'file_modified', message: '文件已由其他客户端修改，请重新读取合并。' } } }; }
    return { data: {} };
  });
  await page.goto('/#files'); await page.getByText('demo.json', { exact: true }).click();
  await expect(page.getByLabel('文件文本编辑器')).toHaveValue(original.replaceAll('\r\n', '\n'));
  await page.getByLabel('文件文本编辑器').fill('changed content'); await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('其他客户端修改');
  await expect(page.getByLabel('文件文本编辑器')).toHaveValue('changed content');
  expect(sent.url).toContain('expect_key=opaque-v1'); expect(sent.body).toBe('changed content');
});

test('Task controls create, start, transition, comment, edit and delete the selected task', async ({ page }) => {
  let task: any = null; let comments: any[] = []; const actions: string[] = [];
  await fixture(page, (id, request) => {
    actions.push(id);
    if (id === 'board') return { data: { tasks: task ? [task] : [], counts: { [task?.stage || 'requirement']: task ? 1 : 0 } } };
    if (id === 'task-create') { task = { id: 'task-1', ...request.postDataJSON(), stage: 'requirement', comments_total: 0 }; return { status: 201, data: task }; }
    if (id === 'task') return { data: { ...task, comments_total: comments.length } };
    if (id === 'comments') return { data: { comments, total: comments.length, has_more: false } };
    if (id === 'task-start') { task.stage = 'executing'; return { data: task }; }
    if (id === 'task-transition') { task.stage = request.postDataJSON().to_stage; return { data: task }; }
    if (id === 'task-accept') { task.stage = 'done'; return { data: task }; }
    if (id === 'comment-create') { const comment = { id: 'comment-1', ...request.postDataJSON(), author_type: 'api', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }; comments.push(comment); return { status: 201, data: comment }; }
    if (id === 'comment-edit') { comments[0] = { ...comments[0], ...request.postDataJSON(), updated_at: '2026-01-02T00:00:00Z' }; return { data: comments[0] }; }
    if (id === 'task-delete') { task = null; comments = []; return { status: 204, text: '' }; }
    return { data: {} };
  });
  await page.goto('/#tasks'); await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务标题', { exact: true }).fill('隔离验收任务'); await page.getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(page.getByRole('heading', { name: '隔离验收任务', exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: '启动', exact: true }).click(); await expect(page.getByRole('button', { name: '启动', exact: true })).toBeDisabled();
  await page.getByLabel('流转到阶段').selectOption('review'); await page.getByRole('button', { name: '验收通过', exact: true }).click();
  await page.getByLabel('补充说明', { exact: true }).fill('评论验收内容'); await page.getByRole('button', { name: '发表评论', exact: true }).click();
  await expect(page.getByText('评论验收内容', { exact: true })).toBeVisible();
  await page.getByLabel('编辑评论', { exact: true }).click(); await page.getByLabel('完整正文', { exact: true }).fill('更新后的验收评论'); await page.getByRole('button', { name: '保存评论', exact: true }).click();
  await expect(page.getByText('更新后的验收评论', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '删除', exact: true }).click(); await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const id of ['task-create','task-start','task-transition','task-accept','comment-create','comment-edit','task-delete']) expect(actions).toContain(id);
});

test('A late file read cannot replace the contents of a newly selected file', async ({ page }) => {
  await fixture(page, id => id === 'files' ? { data: { files: ['first', 'second'].map(name => ({ id: name, name: `${name}.txt`, path: `${name}.txt`, kind: 'file', size: 12, version: name })) } } : { data: {} });
  await page.route('**/gateway/file-read?*', async route => {
    const first = new URL(route.request().url()).searchParams.get('path') === 'first.txt';
    await new Promise(resolve => setTimeout(resolve, first ? 350 : 10));
    await route.fulfill({ contentType: 'text/plain', headers: { 'X-File-Key': first ? 'first-v1' : 'second-v1' }, body: first ? 'first contents' : 'second contents' });
  });
  await page.goto('/#files'); await page.getByText('first.txt', { exact: true }).click(); await page.getByText('second.txt', { exact: true }).click();
  await expect(page.getByLabel('文件文本编辑器')).toHaveValue('second contents');
  await page.waitForTimeout(400); await expect(page.getByLabel('文件文本编辑器')).toHaveValue('second contents');
});
