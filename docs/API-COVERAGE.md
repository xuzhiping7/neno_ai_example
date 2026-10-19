# API 功能覆盖表

2026-10-20 对照官方五章接口手册及公开路由核对：35 个项目接口和 1 个拥有者查询接口。全部提供参数、真实调用和三种语言示例。表中“隔离验收”使用测试响应，不代表对应业务已在真实项目发生。

| # | 功能 | 方法与路径 | 页面入口 | 验证 |
| --- | --- | --- | --- | --- |
| 1 | [验证项目连接](api/quickstart.md#first-request) | `GET /api/v1/ext/project` | 概览 / 连接配置 / API 调试器（`#explorer/project`） | 测试服真实请求通过 |
| 2 | [获取项目助理](api/tasks.md#agents) | `GET /api/v1/ext/agents` | 概览 / 连接配置 / API 调试器（`#explorer/agents`） | 测试服真实请求通过 |
| 3 | [查询密钥元信息](api/quickstart.md#manage) | `GET /api/v1/projects/:projectId/api-key` | 概览 / 连接配置 / API 调试器（`#explorer/key-status`） | 未配置用户令牌；真实验证正确阻断（503） |
| 4 | [发送消息](api/assistant-api.md#chat) | `POST /api/v1/ext/agents/:agentId/chat` | 助理对话 / API 调试器（`#explorer/chat`） | 测试服真实请求通过 |
| 5 | [列出会话](api/assistant-api.md#endpoints) | `GET /api/v1/ext/conversations` | 助理对话 / API 调试器（`#explorer/conversations`） | 测试服真实请求通过 |
| 6 | [读取会话消息](api/assistant-api.md#endpoints) | `GET /api/v1/ext/conversations/:conversationId/messages` | 助理对话 / API 调试器（`#explorer/messages`） | 测试服真实请求通过 |
| 7 | [查询执行结果](api/assistant-api.md#stream) | `GET /api/v1/ext/turns/:turnId` | 助理对话 / API 调试器（`#explorer/turn`） | 测试服真实请求通过 |
| 8 | [订阅执行事件](api/assistant-api.md#stream) | `GET /api/v1/ext/turns/:turnId/stream` | 助理对话 / API 调试器（`#explorer/stream`） | 测试服真实请求通过 |
| 9 | [停止执行](api/assistant-api.md#endpoints) | `POST /api/v1/ext/turns/:turnId/cancel` | 助理对话 / API 调试器（`#explorer/cancel`） | 隔离代理 + 浏览器交互通过 |
| 10 | [查看 VM 子任务](api/assistant-api.md#vm) | `GET /api/v1/ext/turns/:turnId/vm-jobs` | 助理对话 / API 调试器（`#explorer/vm-jobs`） | 测试服真实请求通过 |
| 11 | [恢复待答问题](api/assistant-api.md#actions) | `GET /api/v1/ext/conversations/:conversationId/pending-question` | 助理对话 / API 调试器（`#explorer/pending-question`） | 测试服真实请求通过 |
| 12 | [回答问题并继续](api/assistant-api.md#actions) | `POST /api/v1/ext/conversations/:conversationId/answers` | 助理对话 / API 调试器（`#explorer/answer`） | 隔离代理 + 浏览器交互通过 |
| 13 | [查看工具授权](api/assistant-api.md#actions) | `GET /api/v1/ext/conversations/:conversationId/tool-calls` | 助理对话 / API 调试器（`#explorer/tool-calls`） | 测试服真实请求通过 |
| 14 | [处理工具授权](api/assistant-api.md#actions) | `POST /api/v1/ext/tool-calls/:toolCallId/decision` | 助理对话 / API 调试器（`#explorer/tool-decision`） | 隔离代理 + 浏览器交互通过 |
| 15 | [读取任务看板](api/tasks.md#board) | `GET /api/v1/ext/board` | 任务管理 / API 调试器（`#explorer/board`） | 测试服真实请求通过 |
| 16 | [分页查询任务](api/tasks.md#list-tasks) | `GET /api/v1/ext/tasks` | 任务管理 / API 调试器（`#explorer/tasks`） | 测试服真实请求通过 |
| 17 | [创建任务](api/tasks.md#create-task) | `POST /api/v1/ext/tasks` | 任务管理 / API 调试器（`#explorer/task-create`） | 测试服真实请求通过 |
| 18 | [读取任务详情](api/tasks.md#get-task) | `GET /api/v1/ext/tasks/:taskId` | 任务管理 / API 调试器（`#explorer/task`） | 测试服真实请求通过 |
| 19 | [启动任务](api/tasks.md#start-task) | `POST /api/v1/ext/tasks/:taskId/start` | 任务管理 / API 调试器（`#explorer/task-start`） | 测试服真实请求通过 |
| 20 | [验收任务](api/tasks.md#accept-task) | `POST /api/v1/ext/tasks/:taskId/accept` | 任务管理 / API 调试器（`#explorer/task-accept`） | 测试服真实请求通过 |
| 21 | [流转任务阶段](api/tasks.md#transition) | `POST /api/v1/ext/tasks/:taskId/transition` | 任务管理 / API 调试器（`#explorer/task-transition`） | 测试服真实请求通过 |
| 22 | [归档已完成任务](api/tasks.md#archive-task) | `POST /api/v1/ext/tasks/:taskId/archive` | 任务管理 / API 调试器（`#explorer/task-archive`） | 测试服真实请求通过 |
| 23 | [删除任务](api/tasks.md#delete-task) | `DELETE /api/v1/ext/tasks/:taskId` | 任务管理 / API 调试器（`#explorer/task-delete`） | 测试服真实请求通过 |
| 24 | [读取任务评论](api/tasks.md#comments) | `GET /api/v1/ext/tasks/:taskId/comments` | 任务管理 / API 调试器（`#explorer/comments`） | 测试服真实请求通过 |
| 25 | [发表评论](api/tasks.md#comments) | `POST /api/v1/ext/tasks/:taskId/comments` | 任务管理 / API 调试器（`#explorer/comment-create`） | 测试服真实请求通过 |
| 26 | [编辑 API 评论](api/tasks.md#comments) | `PATCH /api/v1/ext/tasks/:taskId/comments/:commentId` | 任务管理 / API 调试器（`#explorer/comment-edit`） | 测试服真实请求通过 |
| 27 | [移除评论附件引用](api/tasks.md#comments) | `DELETE /api/v1/ext/tasks/:taskId/comments/:commentId/attachments` | 任务管理 / API 调试器（`#explorer/comment-detach`） | 测试服真实请求通过 |
| 28 | [浏览项目目录](api/files.md#list) | `GET /api/v1/ext/files` | 项目文件 / API 调试器（`#explorer/files`） | 测试服真实请求通过 |
| 29 | [批量查询元数据](api/files.md#batch-metadata) | `POST /api/v1/ext/files/metadata` | 项目文件 / API 调试器（`#explorer/file-metadata`） | 测试服真实请求通过 |
| 30 | [读取文本文件](api/files.md#read) | `GET /api/v1/ext/files/read` | 项目文件 / API 调试器（`#explorer/file-read`） | 测试服真实请求通过 |
| 31 | [按路径下载文件](api/files.md#download) | `GET /api/v1/ext/files/download` | 项目文件 / API 调试器（`#explorer/file-download`） | 测试服真实请求通过 |
| 32 | [按 ID 下载文件](api/files.md#download) | `GET /api/v1/ext/files/:fileId` | 项目文件 / API 调试器（`#explorer/file-by-id`） | 测试服真实请求通过 |
| 33 | [读取文件历史](api/files.md#history) | `GET /api/v1/ext/files/:fileId/versions` | 项目文件 / API 调试器（`#explorer/file-versions`） | 测试服真实请求通过 |
| 34 | [下载历史版本](api/files.md#history) | `GET /api/v1/ext/files/:fileId/versions/:versionId/content` | 项目文件 / API 调试器（`#explorer/file-version-download`） | 测试服真实请求通过 |
| 35 | [表单上传文件](api/files.md#upload) | `POST /api/v1/ext/files` | 项目文件 / API 调试器（`#explorer/file-upload`） | 测试服真实请求通过 |
| 36 | [原始字节写入](api/files.md#conditional-write) | `POST /api/v1/ext/files/put` | 项目文件 / API 调试器（`#explorer/file-put`） | 测试服真实请求通过 |

## 验收范围

- 测试服真实验证包含普通成功响应、SSE、二进制下载、文件历史、条件覆盖冲突、任务创建幂等重放、任务归档与删除。
- 助理提问作答、单次工具允许 / 拒绝、停止执行采用隔离浏览器响应验证；不为覆盖率对真实待办自动授权。
- 拥有者登录令牌未提供。该接口已实现并在配置页开放令牌配置，验证项目 Key 不会被错误用于该接口。
- 任务创建、评论发表均支持附件引用；评论还支持 multipart 上传。文件写入支持表单、原始字节和 expect_key。
- 所有请求经同源代理，Key 不进入浏览器响应、Git 或请求记录。

## 测试资源

真实验收保留的文件：`developer-demo/workbench-check-1792435456732.md`。临时任务和评论已经删除；文件用作读写与版本示例。
