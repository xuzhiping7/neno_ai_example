# 与现有项目助理对话

项目 API 是现有平台助理的外部入口。用户在平台创建助理、配置提示词与技能、分配项目及虚拟机后，外部系统即可使用项目 API 秘钥与这个助理对话。

平台聊天和 API 使用同一个助理提交方法、执行池、对话记录、工具库、虚拟机协作和计费流程。助理修改项目文件、执行开发任务、操作已分配虚拟机与云主机的能力遵循平台当前规则。

<a id="flow"></a>

## 交互流程

![助理对话流程](../images/assistant-api.svg)

1. **发送需求**：用项目 API 秘钥与已有助理对话，首次创建会话，后续继续同一会话。
2. **接收输出**：助理按现有权限使用项目文件、知识和虚拟机等资源，统一返回回答、进度与结果。平台端可查看同一份记录。
3. **按需回答**：本轮末尾包含提问时，直接展示返回的问题并提交答案。问题内容已在响应中，正常流程无需另外获取。

<a id="start"></a>

## 开始调用

1. 在项目中添加现有助理，按业务需要配置提示词、技能和项目资源。
2. 在「项目设置 → API 秘钥」获取 `npk_` 秘钥。秘钥代表项目拥有者，仅在受信任的外部服务端保存。
3. 用 `GET /api/v1/ext/agents` 获取该项目助理的 ID。
4. 调用对话接口。对话同时出现在平台原有「对话」列表，可用「API 调用」筛选或会话编号查找。

<a id="chat"></a>

## 发送消息

`POST /api/v1/ext/agents/{agent_id}/chat`

```bash
curl -N 'https://YOUR_HOST/api/v1/ext/agents/AGENT_ID/chat' \
  -H 'Authorization: Bearer npk_YOUR_PROJECT_KEY' \
  -H 'Idempotency-Key: business-request-001' \
  -H 'Content-Type: application/json' \
  -d '{"message":"检查当前项目的代码，修复测试失败并运行验证。","stream":true}'
```

| 字段 | 说明 |
|---|---|
| `message` | 本轮业务需求，沿用平台消息限制 |
| `conversation_id` | 首次省略；后续传回编号，继续同一会话 |
| `client_request_id` | 与 `Idempotency-Key` 二选一；每条新消息用新编号，重试复用原编号和参数 |
| `stream` | true 为实时 SSE 返回 |
| `async` | true 为立即返回 202 执行回执，适合长时间开发任务；不能与 stream 同时开启 |
| `effort` | 同平台思考档位，可省略；low / medium / high / xhigh / max |
| `attachments` | 同平台附件引用格式；project_id 必须是秘钥所属项目 |
| `context` | 可选的当前文件/编辑位置等平台环境上下文；项目必须与秘钥一致 |

项目由秘钥确定。首次不传会话编号才创建新会话；传入不存在或其他项目的会话返回 404。平台与 API 可以继续同一会话；同一会话有执行在途时，另一条新消息返回 409。对话中的后续轮次会读取助理当前配置，与平台行为一致。

请求编号按项目隔离。同编号、同请求返回原执行；同编号换助理、消息或上下文返回 `409 request_conflict`。重试不会重复启动 VM 工作或重复执行项目修改。

<a id="vm"></a>

## 虚拟机开发示例

先在平台把自己的虚拟机分配给当前项目，再提交任务：

```json
{
  "message": "在当前项目的虚拟机里，进入 /workspace/my-app，检查代码后增加健康检查接口，运行相关测试，并告诉我改动文件和验证结果。",
  "client_request_id": "vm-development-001",
  "async": true
}
```

回执与平台聊天相同：

```json
{
  "conversation_id": "...",
  "turn_id": "...",
  "assistant_message_id": "...",
  "status": "running"
}
```

虚拟机操作由助理在平台内部完成，外部系统只需提交业务消息。进度、提问和结果仍通过原对话返回，可订阅 `/ext/turns/{turn_id}/stream` 或查询 `/ext/turns/{turn_id}`。虚拟机委派、任务排队与费用结算沿用平台规则。

虚拟机、项目文件和账户权限仍由平台校验。项目秘钥不能调用其他项目的会话或越过现有资源授权。

<a id="stream"></a>

## 流式输出与结果

`stream: true` 直接订阅平台的执行事件，先给出 `accepted` 回执，再发送文本和工具过程。事件结构沿用平台：

```text
 event: accepted
 data: {"conversation_id":"...","turn_id":"...","assistant_message_id":"...","status":"running"}

 id: 2
 event: text
 data: {"delta":"正在检查项目……"}

 event: turn_end
 data: {"status":"done","error":"","requires_action":false}
```

实际 SSE 行没有前导空格。还可能出现工具、账单、检查点等平台公开事件；客户端按事件类型处理。`id` 是续传游标，允许跳号。

未开启 stream / async 时最多等待 25 秒：执行完成返回 200，仍在运行或需要用户处理时返回 202。响应含 `turn`、`text`、平台 `content`、当前 `activity`。需要回答时，响应直接携带完整的 `question`；`pending_question_id`、`pending_tool_call_id` 保留用于关联既有记录，`requires_action` 指示有待处理事项。费用、产物和工具结果沿用平台内容结构。

**提问跟随本轮对话末尾直接返回。** 流式客户端读取最后一个 `turn_end` 的 `question`；非流式客户端直接读取响应 JSON 的 `question`。异步客户端在订阅流或查询执行结果时得到同样的问题内容。正常对话无需再调用「读取助理提问」，也无需分析工具事件来猜测是否有问题。

```text
event: turn_end
data: {"status":"done","error":"","requires_action":true,"question":{"id":"QUESTION_ID","question":"修改哪个分支？","header":"目标分支","options":[{"label":"开发分支"},{"label":"主分支"}],"multi_select":false}}
```

`turn_end` 表示这一轮输出结束；`question` 非空时，接下来回答该问题即可。该对象包含问题编号、正文、选项、是否允许多选，足够客户端直接展示与作答；`options: []` 表示填写自由文本。平台在本轮结束、问题可以回答后才附带它。已回答、已失效的问题不会在重新连接时再次作为待办返回。

HTTP 或 SSE 连接断开只停止观察，后台执行继续。未收到 `turn_end` 就断开时，重新订阅可使用 `?since=最后确认编号` 或 `Last-Event-ID`；最后一条 `turn_end` 会带回当前仍待回答的问题。取消必须显式调用取消接口。平台端同时查看不会新增一次执行或重复计费。

<a id="endpoints"></a>

## 接口列表

所有接口前缀为 `/api/v1/ext`，使用同一个项目秘钥。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agents` | 项目现有助理列表 |
| POST | `/agents/{agent_id}/chat` | 发起或继续助理对话 |
| GET | `/conversations` | 当前项目中属于秘钥拥有者的助理会话 |
| GET | `/conversations/{id}/messages` | 平台原始消息，分页以 before_id 继续读取，has_more 表示还有历史 |
| GET | `/turns/{turn_id}` | 状态、正文、平台内容和完整待答问题 |
| GET | `/turns/{turn_id}/stream` | 同平台 SSE 事件，支持断线续传 |
| POST | `/turns/{turn_id}/cancel` | 请求停止，沿用平台执行器和 VM 停止确认 |
| GET | `/turns/{turn_id}/vm-jobs` | 可选的内部子任务诊断查询；正常对话无需调用 |
| GET | `/conversations/{id}/pending-question` | 可选的会话恢复查询；正常对话无需调用 |
| POST | `/conversations/{id}/answers` | 回答并续跑 |
| GET | `/conversations/{id}/tool-calls` | 工具授权记录；pending=true 查询待处理项 |
| POST | `/tool-calls/{id}/decision` | 允许或拒绝本次调用 |

<a id="actions"></a>

## 提问、授权与后续消息

需要澄清时，问题已随本轮对话返回。直接使用 `question.id` 和其中的选项，调用 `POST /conversations/{id}/answers`：

```json
{
  "question_id": "...",
  "selected": ["按这个方案继续"],
  "free_text": "只修改测试目录"
}
```

回答沿用平台的问题编号与状态校验。同一问题只能被接受一次；如果另一个客户端已经处理，旧答案返回 409。回答成功后返回新的 `turn_id`，`conversation_id` 保持不变，继续订阅新一轮的流或查询其结果即可。

例如：发送「帮我修改代码」→ 本轮末尾收到「修改哪个分支？」→ 提交「开发分支」→ 助理继续执行。中间没有额外获取问题的请求。

付费工具和需要确认的操作遵守现有授权设置。平台可以处理待办，也可由可信外部系统对当前项目的一次调用提交 `{"allow":true}` 或 `{"allow":false}`。项目 API 不接受 `always:true`，账号级自动授权请在平台设置。

对话记录就是平台既有记录，保留与清理规则一致。API 来源仅用于标记和筛选，不建立单独的助理、发布版本、账户预算或历史系统。无须额外发布助理或签发另一类应用密钥。
