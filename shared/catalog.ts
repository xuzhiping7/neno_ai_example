export type Group = 'project' | 'chat' | 'tasks' | 'files';
export type Field = { name: string; label: string; in: 'path' | 'query'; required?: boolean; placeholder?: string; options?: string[]; default?: string };
export type Endpoint = {
  id: string; group: Group; title: string; method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string;
  description: string; doc: string; fields?: Field[]; body?: Record<string, unknown>;
  input?: 'json' | 'multipart' | 'raw' | 'comment'; output?: 'json' | 'text' | 'download' | 'stream';
  owner?: boolean; caution?: string;
};
const p = (name: string, label: string): Field => ({ name, label, in: 'path', required: true, placeholder: `${label} ID` });
const q = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, in: 'query', ...extra });
const task = p('taskId', '任务');
const conv = p('conversationId', '会话');
const turn = p('turnId', '执行轮次');
const file = p('fileId', '文件');
const comment = p('commentId', '评论');
const path = q('path', '项目相对路径', { placeholder: 'developer-demo/hello.md' });
export const groups: Record<Group, { title: string; label: string; description: string }> = {
  project: { title: '项目与连接', label: 'PROJECT', description: '项目信息与助理列表。' },
  chat: { title: '助理对话', label: 'ASSISTANTS', description: '消息、执行状态与工具授权。' },
  tasks: { title: '任务管理', label: 'TASKS', description: '任务和评论管理。' },
  files: { title: '项目文件', label: 'FILES', description: '文件读写与版本查询。' },
};
export const endpoints: Endpoint[] = [
  { id: 'project', group: 'project', title: '验证项目连接', method: 'GET', path: '/ext/project', description: '获取当前项目名称和 Key 有效期。项目由 Key 决定，无需传项目 ID。', doc: 'quickstart#first-request' },
  { id: 'agents', group: 'project', title: '获取项目助理', method: 'GET', path: '/ext/agents', description: '列出项目已配置的助理，使用返回的 ID 发起对话或分配任务。', doc: 'tasks#agents' },
  { id: 'key-status', group: 'project', title: '查询密钥元信息', method: 'GET', path: '/projects/:projectId/api-key', description: '仅项目拥有者可查询，使用服务端 NENO_OWNER_TOKEN 登录令牌；项目 Key 不适用于此接口。', doc: 'quickstart#manage', fields: [p('projectId', '项目')], owner: true },
  { id: 'chat', group: 'chat', title: '发送消息', method: 'POST', path: '/ext/agents/:agentId/chat', description: '支持同步、SSE 流式和异步模式。首次省略 conversation_id，后续传回。每条新消息使用新的请求编号，重试复用原编号及原参数。stream 与 async 不能同时为 true。', doc: 'assistant-api#chat', fields: [p('agentId', '助理')], input: 'json', body: { message: '你好，请简单介绍你的能力。', stream: true, client_request_id: '{{uuid}}' } },
  { id: 'conversations', group: 'chat', title: '列出会话', method: 'GET', path: '/ext/conversations', description: '当前项目中属于 Key 拥有者的助理会话，与平台记录共用。', doc: 'assistant-api#endpoints' },
  { id: 'messages', group: 'chat', title: '读取会话消息', method: 'GET', path: '/ext/conversations/:conversationId/messages', description: '返回平台原始消息。has_more 为 true 时，传 before_id 继续加载历史。', doc: 'assistant-api#endpoints', fields: [conv, q('before_id', '更早消息游标')] },
  { id: 'turn', group: 'chat', title: '查询执行结果', method: 'GET', path: '/ext/turns/:turnId', description: '读取状态、正文、活动、平台内容和完整待答问题。', doc: 'assistant-api#stream', fields: [turn] },
  { id: 'stream', group: 'chat', title: '订阅执行事件', method: 'GET', path: '/ext/turns/:turnId/stream', description: 'SSE 实时进度；断线后使用最后确认的事件 ID 作为 since 继续。断开观察不会取消后台执行。', doc: 'assistant-api#stream', fields: [turn, q('since', '最后确认的事件 ID')], output: 'stream' },
  { id: 'cancel', group: 'chat', title: '停止执行', method: 'POST', path: '/ext/turns/:turnId/cancel', description: '显式请求取消。需继续查询状态，确认执行器与 VM 已停止。', doc: 'assistant-api#endpoints', fields: [turn], caution: '将向当前轮次发送停止请求。' },
  { id: 'vm-jobs', group: 'chat', title: '查看 VM 子任务', method: 'GET', path: '/ext/turns/:turnId/vm-jobs', description: '查询此轮次关联的虚拟机子任务，用于开发诊断。', doc: 'assistant-api#vm', fields: [turn] },
  { id: 'pending-question', group: 'chat', title: '恢复待答问题', method: 'GET', path: '/ext/conversations/:conversationId/pending-question', description: '重新打开会话时恢复待答问题。正常对话直接使用 turn_end 返回的 question。', doc: 'assistant-api#actions', fields: [conv] },
  { id: 'answer', group: 'chat', title: '回答问题并继续', method: 'POST', path: '/ext/conversations/:conversationId/answers', description: '使用 question.id 提交选项或自由文本。成功后继续订阅返回的新 turn_id。问题只能被接受一次。', doc: 'assistant-api#actions', fields: [conv], input: 'json', body: { question_id: '', selected: [], free_text: '' } },
  { id: 'tool-calls', group: 'chat', title: '查看工具授权', method: 'GET', path: '/ext/conversations/:conversationId/tool-calls', description: '读取工具调用授权记录，pending=true 仅查询待处理项。', doc: 'assistant-api#actions', fields: [conv, q('pending', '仅待处理', { options: ['', 'true', 'false'], default: 'true' })] },
  { id: 'tool-decision', group: 'chat', title: '处理工具授权', method: 'POST', path: '/ext/tool-calls/:toolCallId/decision', description: '允许或拒绝本次工具调用。仅支持单次决定，不能设置 always:true。', doc: 'assistant-api#actions', fields: [p('toolCallId', '工具调用')], input: 'json', body: { allow: false }, caution: '请核实工具名称与参数，再提交单次授权决定。' },
  { id: 'board', group: 'tasks', title: '读取任务看板', method: 'GET', path: '/ext/board', description: '四列任务、全项目阶段计数和执行轮次。归档数量在 counts 中，详情通过任务分页获取。', doc: 'tasks#board' },
  { id: 'tasks', group: 'tasks', title: '分页查询任务', method: 'GET', path: '/ext/tasks', description: '按阶段查询，使用 next_offset 继续翻页；done 与 archived 也可读取。', doc: 'tasks#list-tasks', fields: [q('stage', '任务阶段', { options: ['active', 'requirement', 'executing', 'review', 'done', 'archived'], default: 'active' }), q('offset', '偏移量', { default: '0' }), q('limit', '每页条数（1–100）', { default: '20' })] },
  { id: 'task-create', group: 'tasks', title: '创建任务', method: 'POST', path: '/ext/tasks', description: '创建待执行任务，不自动启动。可配置执行、验收和收尾助理、前置依赖及附件。client_request_id 使用 UUID，重试复用。', doc: 'tasks#create-task', input: 'json', body: { title: '我的第一个 API 任务', description: '从开发者工作台创建。', task_type: 'general', wait_approval: true, client_request_id: '{{uuid}}' } },
  { id: 'task', group: 'tasks', title: '读取任务详情', method: 'GET', path: '/ext/tasks/:taskId', description: '直接返回任务对象，含最近 200 条评论及历史游标。stage 为 executing 不等于执行器仍在运行。', doc: 'tasks#get-task', fields: [task] },
  { id: 'task-start', group: 'tasks', title: '启动任务', method: 'POST', path: '/ext/tasks/:taskId/start', description: '切换到 executing；指派了助理才尝试派发执行。', doc: 'tasks#start-task', fields: [task] },
  { id: 'task-accept', group: 'tasks', title: '验收任务', method: 'POST', path: '/ext/tasks/:taskId/accept', description: '有收尾助理时仍可能停在 review，需继续查询直到 done。force=true 会跳过收尾。', doc: 'tasks#accept-task', fields: [task], input: 'json', body: { force: false } },
  { id: 'task-transition', group: 'tasks', title: '流转任务阶段', method: 'POST', path: '/ext/tasks/:taskId/transition', description: '无执行在途时可在四个阶段间流转。存在执行、依赖阻塞或不合法流转会返回 409。', doc: 'tasks#transition', fields: [task], input: 'json', body: { to_stage: 'review' } },
  { id: 'task-archive', group: 'tasks', title: '归档已完成任务', method: 'POST', path: '/ext/tasks/:taskId/archive', description: '仅 done 任务可归档。归档是终态，保留评论与成果，不可恢复到看板。', doc: 'tasks#archive-task', fields: [task], caution: '归档后不可恢复到看板。' },
  { id: 'task-delete', group: 'tasks', title: '删除任务', method: 'DELETE', path: '/ext/tasks/:taskId', description: '删除任务、运行记录和评论，保留项目文件。成功 204；执行器尚未停止时返回 409。', doc: 'tasks#delete-task', fields: [task], caution: '永久删除该任务及评论；项目文件保留。' },
  { id: 'comments', group: 'tasks', title: '读取任务评论', method: 'GET', path: '/ext/tasks/:taskId/comments', description: '每页正序，使用 next_cursor 作为 before 加载更早评论。', doc: 'tasks#comments', fields: [task, q('limit', '每页条数（1–200）', { default: '50' }), q('before', '更早评论游标')] },
  { id: 'comment-create', group: 'tasks', title: '发表评论', method: 'POST', path: '/ext/tasks/:taskId/comments', description: '支持 JSON 引用已有文件，或 multipart 同时上传附件。文字与附件至少一项，最多 20 个附件，总上传 ≤50 MiB。无幂等键，超时请先读取确认。', doc: 'tasks#comments', fields: [task], input: 'comment', body: { body: '来自 API 的第一条评论。', author_name: '开发者', file_refs: [] } },
  { id: 'comment-edit', group: 'tasks', title: '编辑 API 评论', method: 'PATCH', path: '/ext/tasks/:taskId/comments/:commentId', description: 'body 必传，file_refs 省略保留、[] 清空；仅能编辑 API 来源评论，不能更改署名。', doc: 'tasks#comments', fields: [task, comment], input: 'json', body: { body: '更新后的评论内容。' } },
  { id: 'comment-detach', group: 'tasks', title: '移除评论附件引用', method: 'DELETE', path: '/ext/tasks/:taskId/comments/:commentId/attachments', description: '只移除引用，原文件保留；操作后评论不能同时无正文、无附件。', doc: 'tasks#comments', fields: [task, comment, { ...path, required: true }], caution: '仅移除此评论的附件引用，不删除文件。' },
  { id: 'files', group: 'files', title: '浏览项目目录', method: 'GET', path: '/ext/files', description: 'path 为空表示根目录；recursive=true 列全部后代。返回路径、摘要和不透明版本标识，不分页、不截断。', doc: 'files#list', fields: [q('path', '目录路径', { placeholder: '留空为根目录' }), q('recursive', '递归列出', { options: ['false', 'true'], default: 'false' })] },
  { id: 'file-metadata', group: 'files', title: '批量查询元数据', method: 'POST', path: '/ext/files/metadata', description: '只读查询，1–500 个路径，JSON ≤1 MiB。逐项返回 found / not_found / is_directory / invalid_path。', doc: 'files#batch-metadata', input: 'json', body: { paths: ['developer-demo/hello.md'] } },
  { id: 'file-read', group: 'files', title: '读取文本文件', method: 'GET', path: '/ext/files/read', description: '直接返回文本，响应头 X-File-Key 用于条件覆盖。', doc: 'files#read', fields: [{ ...path, required: true }], output: 'text' },
  { id: 'file-download', group: 'files', title: '按路径下载文件', method: 'GET', path: '/ext/files/download', description: '返回文件原始字节；路径必须是文件，不能下载目录。', doc: 'files#download', fields: [{ ...path, required: true }], output: 'download' },
  { id: 'file-by-id', group: 'files', title: '按 ID 下载文件', method: 'GET', path: '/ext/files/:fileId', description: '使用目录或元数据返回的节点 ID 下载当前文件。', doc: 'files#download', fields: [file], output: 'download' },
  { id: 'file-versions', group: 'files', title: '读取文件历史', method: 'GET', path: '/ext/files/:fileId/versions', description: '历史由平台开关控制，默认关闭。按 version_no 倒序返回，最多保留 20 条。', doc: 'files#history', fields: [file] },
  { id: 'file-version-download', group: 'files', title: '下载历史版本', method: 'GET', path: '/ext/files/:fileId/versions/:versionId/content', description: 'versionId 使用历史条目的 id，不是 version_no，也不是条件覆盖的 version。不改变当前文件。', doc: 'files#history', fields: [file, p('versionId', '历史版本')], output: 'download' },
  { id: 'file-upload', group: 'files', title: '表单上传文件', method: 'POST', path: '/ext/files', description: 'multipart 文件上传，目标目录自动创建；overwrite=true 才覆盖。同名未允许覆盖返回 409。', doc: 'files#upload', input: 'multipart' },
  { id: 'file-put', group: 'files', title: '原始字节写入', method: 'POST', path: '/ext/files/put', description: '使用 POST，正文为原始字节，≤50 MiB。默认覆盖；传 expect_key 可检测冲突，409 时重新读取并合并。', doc: 'files#conditional-write', fields: [{ ...path, required: true }, q('expect_key', '预期版本（可选）')], input: 'raw', caution: '未提供 expect_key 时将直接覆盖同名文件。' },
];
export const byId = Object.fromEntries(endpoints.map(endpoint => [endpoint.id, endpoint])) as Record<string, Endpoint>;
export function resolveEndpoint(endpoint: Endpoint, values: Record<string, string>) {
  let route = endpoint.path;
  const query = new URLSearchParams();
  for (const field of endpoint.fields ?? []) {
    const value = values[field.name] ?? '';
    if (field.required && !value.trim()) throw new Error(`请填写${field.label}`);
    if (field.in === 'path') {
      if (!/^[\w-]+$/.test(value)) throw new Error(`${field.label} ID 格式不正确`);
      route = route.replace(`:${field.name}`, encodeURIComponent(value));
    } else if (value !== '') query.set(field.name, value);
  }
  return `/api/v1${route}${query.size ? `?${query}` : ''}`;
}
