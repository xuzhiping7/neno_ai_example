# 任务与助理 API

用项目秘钥查看项目里的助理、对任务做增删启动验收，以及读取和发表评论。所有接口 `Authorization: Bearer $KEY`，`$HOST` 为站点地址。

<a id="stages"></a>

## 任务状态机

看板有四个可流转阶段，接口操作与页面看板完全一致；归档后进入 `archived` 终态，只供历史查询，不可执行或流转：

```
requirement（待执行） ↔ executing（执行中） ↔ review（待验收） ↔ done（已完成）
```

- 任务没有正在执行的轮次时，四个阶段间**可随意流转**（[通用流转接口](#transition)或启动/验收快捷接口）——包括把执行中/待验收的任务收回 `requirement`、重开已 `done` 的任务；
- 执行/验收/收尾进行中返回 409 `turn_running`（收尾进行中为 409 `has_running`，可带 `force` 直接完成）；
- 「启动任务」= `requirement → executing`，有执行助理时会尝试派发；未指派助理则只切换阶段；
- 需要人工验收时，执行完成停在 `review`；配置了验收助理则自动按其结论流转，无验收助理且关闭人工验收、未配置收尾时直接完成；
- 「验收任务」= 请求通过；有收尾助理时先留在 `review` 执行收尾，完成后才进入 `done`；
- 其余不合法流转：同列挪动、执行中直接完结已配验收的任务，返回 409 `illegal_transition`；
- 归档后的任务 `stage` 为 `archived`（已归档）：终态，不可流转、不可派活、不可重启，视为已完结（作为前置依赖时不再阻塞后继）。拥有者和团队成员可在页面单个或批量归档；项目秘钥可通过下方的单任务归档接口操作。

<a id="project"></a>

## 连通自检

```bash
curl -H "Authorization: Bearer $KEY" $HOST/api/v1/ext/project
```

返回项目名与秘钥有效期（见[快速开始](quickstart.md#first-request)）。

<a id="agents"></a>

## 查看所有助理

`GET /api/v1/ext/agents` —— 项目内全部助理（与项目侧栏同源）；建任务时用 `id` 指派执行/验收助理。

```bash
curl -H "Authorization: Bearer $KEY" $HOST/api/v1/ext/agents
```

```json
{
  "agents": [
    {
      "id": "8f0c…",
      "name": "写手",
      "role": "内容写作",
      "description": "负责撰写与润色",
      "model": "…"
    }
  ]
}
```

<a id="board"></a>

## 看板总览

`GET /api/v1/ext/board` —— 返回看板四列（`requirement`、`executing`、`review`、`done`）的任务详情、全项目各阶段计数和正在执行的轮次，适合轮询。`counts.archived` 包含归档数量，但 `tasks` 不携带归档详情；枚举历史请使用下面的分页接口。

看板中的 `comment_count` 是评论总数（零条时可能省略），不内嵌评论正文。看板和分页任务列表均需通过[任务详情](#get-task)或[评论接口](#comments)读取正文。

```bash
curl -H "Authorization: Bearer $KEY" $HOST/api/v1/ext/board
```

```json
{
  "tasks": [ { "id": "175a…", "title": "写周报", "task_type": "documentation", "stage": "review", "…": "…" } ],
  "counts": { "requirement": 0, "executing": 1, "review": 2, "done": 5, "archived": 28 },
  "auto_chain": false,
  "running_runs": [ { "task_id": "…", "agent_id": "…", "status": "running" } ]
}
```

<a id="list-tasks"></a>

## 按阶段分页查询

`GET /api/v1/ext/tasks?stage=archived&offset=0&limit=20`。项目始终由秘钥决定。

| 参数 | 说明 |
| --- | --- |
| `stage` | 默认 `active`（待执行、执行中、待验收）；也可指定 `requirement`、`executing`、`review`、`done`、`archived` |
| `offset` | 非负整数，默认 0；下一页使用响应的 `next_offset` |
| `limit` | 正整数；活跃阶段默认 50，`done`/`archived` 默认 20；超过 100 按 100 返回 |

```bash
curl -H "Authorization: Bearer $KEY" "$HOST/api/v1/ext/tasks?stage=archived&offset=0&limit=20"
```

响应包含 `tasks`、`stage`、`counts`、`auto_chain`、`total`、`offset`、`limit`、`returned`、`has_more`，有下一页时还包含 `next_offset`。`counts` 是全项目各阶段数量，`total` 是本次阶段筛选的总数，`returned` 是当前页实际任务数。例如归档 28 条时，第一页 `total=28, returned=20, has_more=true, next_offset=20`，第二页返回剩余 8 条。

历史按 `closed_at` 倒序（空值最后）、`id` 升序排列；其他阶段按 `updated_at` 倒序、`id` 升序排列。同一响应的计数与任务来自同一数据库快照；翻页期间若任务被删除或阶段发生变化，应从第一页重新枚举。

<a id="create-task"></a>

## 新建任务

`POST /api/v1/ext/tasks`，JSON 请求体（`title` 必填，其余可选——不指派助理就只建卡片）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | string | 任务标题（1–200 字，必填） |
| `client_request_id` | string | 可选 UUID，用于创建重试去重；同一项目、同一创建者、同一请求键及相同内容返回原任务的当前状态，内容不同返回 409 `request_conflict` |
| `task_type` | string | 类型：`general` 通用（默认）、`feature` 需求、`bug` 缺陷、`design` 设计、`improvement` 优化、`technical` 技术任务、`research` 调研、`documentation` 文档 |
| `description` | string | 任务描述/需求说明 |
| `file_refs` | string[] | 关联的项目相对文件路径，如 `["reports/数据.csv"]`，会传入助理的任务说明 |
| `assigned_agent_id` | string | 执行助理 id（来自[助理列表](#agents)） |
| `assigned_agent_name` | string | 也可按项目内助理名称指派；与 `assigned_agent_id` 二选一 |
| `review_agent_id` | string | 自动验收助理 id；通过后完成或进入收尾，不会再等待人工确认 |
| `review_agent_name` | string | 按名称选择验收助理；与 `review_agent_id` 二选一 |
| `wait_approval` | boolean | 仅无验收助理时决定是否等待人工验收，默认 `true`；设为 `false` 且无收尾助理时执行完直接完成 |
| `blocked_by_id` | string | 前置任务 id：前置未完成时不能启动 |
| `post_review_agent_id` | string | 可选收尾助理 id，通过验收后执行，完成收尾才进入 `done` |
| `post_review_agent_name` | string | 按名称选择收尾助理；与 `post_review_agent_id` 二选一 |
| `post_review_prompt` | string | 给收尾助理的指令，省略时使用默认收尾说明 |

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"写周报","description":"汇总本周数据","assigned_agent_id":"8f0c…","wait_approval":true}' \
  $HOST/api/v1/ext/tasks
```

成功 201，返回完整任务对象（记下 `id`），包括 `task_type`。类型不传或传空字符串时使用 `general`；类型不在支持范围内返回 400 `invalid_task_type`。助理 id 不对返回 400 `invalid_reference`。

名称按项目助理列表精确匹配；同一角色同时传 id 和名称、名称不存在都会返回 400 `invalid_reference`。项目有同名助理时，请从助理列表取确切 id，以免选错。创建后任务处于 `requirement`，不会自动开始执行。

需要处理超时或响应丢失时，在首次提交前生成并保存 `client_request_id`，重试使用同一键和相同内容。成功重放仍返回 201，任务可能已经处于执行中、待验收或完结，应读取返回阶段后再决定后续动作。请求键仅在任务存续期间用于去重；主动删除任务后应停止重试原创建请求。新任务使用新键，省略该字段时每次请求都创建新任务。

<a id="get-task"></a>

## 任务详情

```bash
curl -H "Authorization: Bearer $KEY" $HOST/api/v1/ext/tasks/<任务id>
```

返回任务全量字段——重点看 `stage`（决定能不能启动/验收）与 `assigned_agent_id`。详情还包含 `comments` 数组：最近 200 条评论，按时间正序排列；没有评论时为 `[]`。`comments_total` 为总数，`comments_has_more` 表示是否还有更早记录，`comments_next_cursor` 可用于评论接口继续读取。包含成员、助理和 API 调用方的留言，字段见[任务评论](#comments)。

创建、详情、启动、验收和通用流转都直接返回任务对象，没有额外的 `task` 包装。常用字段如下；未配置的可选 id 字段可能省略：

| 字段 | 含义 |
| --- | --- |
| `id`、`project_id` | 任务与所属项目 id |
| `title`、`description`、`task_type`、`stage` | 任务内容、类型与当前阶段 |
| `file_refs` | 关联项目文件的相对路径 |
| `assigned_agent_id`、`review_agent_id`、`post_review_agent_id` | 执行、验收和收尾助理 |
| `wait_approval`、`blocked_by_id`、`post_review_prompt` | 人工验收、前置依赖和收尾指令 |
| `conversation_id`、`review_conversation_id`、`post_review_conversation_id` | 已创建的对应任务会话 id |
| `created_at`、`updated_at`、`closed_at` | 创建、更新和完成时间；未完成时可能没有 `closed_at` |
| `revision` | 任务属性的编辑版本；用于网页和助理工具的编辑冲突检测 |

看板还会补充 `run_state`、`last_run` 等运行信息，结合 `running_runs` 判断是否真有执行。`run_state=interrupted` 表示执行被中断。详情的 `stage=executing` 本身不代表仍在运行，也不代表成功；不要依赖详情里一定有看板的派生字段。

<a id="comments"></a>

## 任务评论

### 读取评论

`GET /api/v1/ext/tasks/<任务id>/comments?limit=50&before=<游标>`，返回 `{comments, total, has_more, next_cursor}`。默认读取最近 50 条，`limit` 为正整数、上限 200，页内按时间与 ID 正序排列。`has_more=true` 时将 `next_cursor` 原样传入下一次请求的 `before`，继续读取更早评论；直到 `has_more=false` 才是完整历史。无评论时 `comments=[]`、`total=0`。游标绑定任务并包含时间和 ID，边界评论被删除后仍可翻页；无效或跨任务游标返回 400，权限检查与任务详情相同。网页只轮询最新页，已加载历史保留在本次页面缓存中；重新打开或刷新页面可重新读取历史中的修改。读取任务要求时，应同时查看评论中的补充说明。

```bash
curl -H "Authorization: Bearer $KEY" "$HOST/api/v1/ext/tasks/<任务id>/comments"
```

### 发表评论并指定显示用户名

`POST /api/v1/ext/tasks/<任务id>/comments`，JSON 请求体：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `body` | string | 评论正文，去掉首尾空白后最多 5000 字；附带文件时可省略或为空 |
| `author_name` | string | 可选，调用方的显示用户名/署名，最多 80 字；去掉首尾空白，省略或全空白时显示 `API`；不支持控制字符 |
| `file_refs` | string[] | 可选，已存在的项目相对文件路径，如 `docs/验收.md`、`images/截图.png`；知道路径时直接引用，无需上传。只能引用秘钥对应项目内的文件，最多 20 个 |

文字和附件至少提供一项。同一评论可混合正文、图片和普通文件。

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"body":"功能已完成，等待验收。","author_name":"我的自动化助手"}' \
  "$HOST/api/v1/ext/tasks/<任务id>/comments"
```

成功返回 201 和评论对象：

```json
{
  "id": "评论id",
  "task_id": "任务id",
  "body": "功能已完成，等待验收。",
  "file_refs": [],
  "created_by": "项目拥有者id",
  "author_type": "api",
  "author_name": "我的自动化助手",
  "created_at": "2026-09-29T08:00:00Z",
  "updated_at": "2026-09-29T08:00:00Z"
}
```

### 直接引用已有项目文件

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"body":"请查看截图和验收报告。","file_refs":["images/截图.png","docs/验收.md"]}' \
  "$HOST/api/v1/ext/tasks/<任务id>/comments"
```

`file_refs` 是项目根目录下的相对路径，不接受操作系统绝对路径、`..`、外部 URL 或目录。文件必须已存在且未删除；路径不存在、越界或不属于当前项目时返回 400 `invalid_reference`。同一路径重复提供会去重，引用不会复制或重新上传文件。

### 随评论上传图片和文件

同一 POST 接口也接受 `multipart/form-data`：`body`、`author_name` 是文本字段，`file_refs` 是 JSON 数组字符串，`files` 可重复附带多个文件（单文件也接受 `file`）。由 curl 或客户端自动生成 multipart 的 Content-Type 和 boundary。

```bash
curl -X POST -H "Authorization: Bearer $KEY" \
  -F 'body=附上本次截图和日志。' -F 'author_name=验收助手' \
  -F 'file_refs=["docs/验收.md"]' \
  -F 'files=@./截图.png' -F 'files=@./执行日志.txt' \
  "$HOST/api/v1/ext/tasks/<任务id>/comments"
```

服务端先将上传文件保存到当前项目的 `attachments/comments/<随机目录>/<原文件名>`，再把这些路径与已有引用一起写入评论的 `file_refs`。响应、任务详情、评论列表和网页均使用同一份路径；文件可在项目文件树查看，也可通过项目文件 API 读取或下载。同名上传使用独立目录，不覆盖已有文件。

每条评论总计最多 20 个附件，上传文件的总大小最多 50 MB，并占用项目拥有者的存储空间；超出上传限制返回 413 `attachment_too_large`，空间不足返回 413 `quota_exceeded`。文字可以为空，因此也可以只发图片或文件。移除引用或删除评论不会删除项目文件；原文件移动或删除后，页面会标记引用失效。

`author_name` 只是这条评论的显示署名，按提交时的文本保存：**不创建用户、不查找或修改同名账号、不改变权限**。可以每次提交不同署名，不需要事先注册。鉴权始终取决于项目秘钥；`created_by` 记录项目拥有者，页面标注 `API` 来源，也不会借用拥有者的头像或邮箱。不能传 `agent_id` 或 `created_by` 指定真实身份，非空值返回 400 `invalid_request`。

读取时 `author_type` 还可能是 `user`（成员）、`agent`（助理）或 `gone`（已注销）；`author_name` 为各自显示名，`author_email`/`author_avatar` 按作者类型提供。`updated_at` 为最后编辑时间，与 `created_at` 不同表示评论曾编辑。API 评论可通过下方接口修改正文和附件引用，署名保持不变；项目拥有者可在页面删除。

正文和附件同时为空、正文过长，或署名不合法返回 400 `invalid_request`；任务不存在或不属于秘钥绑定项目都返回 404。项目归档后仍可读取评论与附件，写入返回 409 `project_archived`。评论写入没有幂等键，请求超时后先读取确认，避免重复发表。

### 编辑评论与最后编辑时间

`PATCH /api/v1/ext/tasks/<任务id>/comments/<评论id>`，使用 JSON 请求体：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `body` | string | 必传，替换后的完整正文；去掉首尾空白后最多 5000 字。有附件时允许为空字符串 |
| `file_refs` | string[] | 可选，替换附件引用列表；省略则保留原附件，`[]` 清空引用。限制与发表评论相同 |

```bash
curl -X PATCH -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"body":"补充验收结果：全部通过。"}' \
  "$HOST/api/v1/ext/tasks/<任务id>/comments/<评论id>"
```

成功返回 200 和更新后的评论对象。每次编辑成功，服务端记录当前时间到 `updated_at`；`created_at`、`created_by`、`author_type` 和 `author_name` 保持不变。列表及任务详情返回同一份最后编辑时间，页面显示「已编辑」。例如：

```json
{
  "id": "评论id",
  "task_id": "任务id",
  "body": "补充验收结果：全部通过。",
  "file_refs": [],
  "created_by": "项目拥有者id",
  "author_type": "api",
  "author_name": "我的自动化助手",
  "created_at": "2026-09-30T08:00:00Z",
  "updated_at": "2026-09-30T08:05:00Z"
}
```

仅可编辑秘钥绑定项目内的 **API 来源评论**，不按显示署名区分调用者；不能改写网页用户或站内助理发表的评论，此类请求返回 403 `author_only`。不能传 `author_name`、`agent_id`、`created_by` 修改署名或身份，传入返回 400 `invalid_request`。缺少 `body`、正文过长或清空全部内容也返回 400，失败时原内容和最后编辑时间保持不变。

评论不存在、评论不属于指定任务、任务不属于当前项目或标识无效返回 404；项目已归档返回 409 `project_archived`。编辑接口只接受 JSON；新增附件先通过[文件上传接口](files.md)上传，再在 `file_refs` 中引用。请求超时后先重新读取评论，确认内容是否已更新。

### 移除单个附件引用

`DELETE /api/v1/ext/tasks/<任务id>/comments/<评论id>/attachments?path=<项目相对路径>`。查询参数 `path` 必传且只能提供一次；不需要提交正文或整个 `file_refs` 列表。

```bash
curl -X DELETE --get -H "Authorization: Bearer $KEY" \
  --data-urlencode 'path=docs/验收报告.pdf' \
  "$HOST/api/v1/ext/tasks/<任务id>/comments/<评论id>/attachments"
```

成功返回 200 和当前评论对象。仅从该评论的 `file_refs` 中移除指定路径，正文、署名、创建时间、其他附件及其他评论的引用都保留；**项目原文件不会删除**。原文件已经移动或删除时也可以清理失效引用。

实际移除时更新 `updated_at`（最后编辑时间）。指定路径已不在该评论中时仍返回 200，内容和编辑时间不变，可安全重试。数据库直接更新当前引用数组，并发移除不同引用不会覆盖彼此，也不会覆盖同时编辑的正文。

权限与编辑评论一致，仅允许操作当前项目的 API 来源评论。移除后若正文和附件将同时为空，返回 400 `invalid_request`，评论保持原样；请先补充正文或保留至少一个附件。缺少或重复 `path` 返回 400 `invalid_request`，非法路径返回 400 `invalid_reference`。无效/不存在的任务或评论、跨项目或评论不属于指定任务返回 404；非 API 来源返回 403 `author_only`；项目已归档返回 409 `project_archived`。

<a id="archive-task"></a>

## 归档任务

```bash
curl -X POST -H "Authorization: Bearer $KEY" $HOST/api/v1/ext/tasks/<任务id>/archive
```

仅允许归档 `done`（已完结）的任务。成功返回 200 和归档后的任务对象，`stage` 为 `archived`；任务记录、评论、完成时间和成果文件均保留。任务移出看板，可通过 `GET /ext/tasks?stage=archived` 查询。

未完结或已归档的任务返回 409 `illegal_transition`；任务不存在、标识无效或不属于本项目返回 404；项目已归档返回 409 `project_archived`。归档是终态，不能恢复到看板。请求超时后先查询任务详情，若已为 `archived` 则无须重试。

<a id="delete-task"></a>

## 删除任务

```bash
curl -X DELETE -H "Authorization: Bearer $KEY" $HOST/api/v1/ext/tasks/<任务id>
```

成功 204，响应体为空。任务不存在、标识无效或不属于本项目都是 404；重复删除返回 404；项目已归档返回 409 `project_archived`。删除会移除任务、任务运行记录和评论，项目成果文件保留。

任务仍有执行、验收、收尾或等待停止确认的执行器时，返回 409 `task_running`，任务与运行记录保留。请先停止并确认执行已结束，再重试删除；仅发出取消请求不能保证已满足删除条件。

项目秘钥代表项目拥有者，可删除绑定项目内的任何任务（包括已归档任务）。页面登录的团队成员仅可删除自己创建的任务；归档权限不受创建者限制。

<a id="start-task"></a>

## 启动任务

```bash
curl -X POST -H "Authorization: Bearer $KEY" $HOST/api/v1/ext/tasks/<任务id>/start
```

`requirement → executing`，有执行助理时会尝试派发；未指派助理也能进入执行中，但不会自动执行。阶段切换成功不等于派发一定成功，需继续查看任务详情和运行状态。并发执行限制按会话判断，同一个助理可以在不同任务会话中工作。

<a id="accept-task"></a>

## 验收任务

```bash
# 普通验收（走验收门：配了收尾助理会先跑收尾）
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{}' $HOST/api/v1/ext/tasks/<任务id>/accept

# 直接完成：跳过收尾助理，任务立即关闭
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"force":true}' $HOST/api/v1/ext/tasks/<任务id>/accept
```

没有收尾助理时，通过后 `stage` 变为 `done`；有收尾助理时首次通过会启动收尾，返回的任务仍可能是 `review`，应继续查询直到 `done`。收尾执行进行中再次请求普通通过会返回 409 `has_running`；`force` 会跳过收尾，并取消仍在执行的收尾轮次。

<a id="transition"></a>

## 通用流转

```bash
# 把执行中的任务收回待执行（比如执行失败后不想继续了）
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"to_stage":"requirement"}' $HOST/api/v1/ext/tasks/<任务id>/transition

# 重开已完结的任务（拖回执行中，有执行助理时会重新派发）
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"to_stage":"executing"}' $HOST/api/v1/ext/tasks/<任务id>/transition
```

`to_stage` 可为四个阶段任意一个，规则与页面拖拽一致：没有轮次在跑时可任意流转（挪到 `executing` 派执行、挪到 `review` 派验收、挪到 `done` 走收尾闸门、挪回 `requirement` 纯挪动）；有轮次在跑返回 409（`turn_running`，收尾在跑为 `has_running`，后者可用 `"force":true` 直接完成）。前置任务未完结时进入 `executing` 返回 409 `blocked`（已归档 `archived` 的前置视为已完结）；执行中的任务直接流转 `done` 若已配验收/收尾会返回 409 `illegal_transition`。

<a id="flow"></a>

## 典型对接流程

下面以人工验收的任务为例：

1. `GET /ext/agents` 选好执行助理；
2. `POST /ext/tasks` 建任务拿 `id`，不设置验收助理并保持 `wait_approval: true`；
3. `POST /ext/tasks/<id>/start` 启动；
4. 轮询 `GET /ext/tasks/<id>`（或 `GET /ext/board`），等 `stage` 到 `review`；
5. `POST /ext/tasks/<id>/accept` 提交通过，继续查询直到 `stage` 为 `done`。

自动验收或跳过验收的任务可能直接达到 `done`，轮询程序应同时处理 `review` 与 `done`，不要只等待人工验收阶段。

执行过程的产物（生成的文件）通过[文件 API](files.md) 取回。

项目秘钥尚未开放任务内容修改、评论删除、批量归档和停止轮次接口。请求超时后先重新查询任务状态，再决定是否重试创建或启动，避免重复建卡或重复执行。

项目归档期间，任务读取及历史查询仍可用；任务写入和执行返回 `409 project_archived`。请由项目拥有者恢复项目后重试。项目归档不改变任务原阶段，恢复项目也不重开已归档任务。
