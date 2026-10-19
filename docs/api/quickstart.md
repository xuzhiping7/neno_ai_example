# 快速开始

项目 API 让外部程序（脚本、自动化、第三方系统）通过 HTTP 与 NenoAI 项目里的现有助理对话，以及操作任务与文件。本文档面向开发者；界面上怎么管理秘钥见使用手册的项目 API（文档站路径：`/manual/project-api`） 章节。

让外部智能体操作项目时，可前往[智能体接口技能](agent-skill.md) 下载包含完整接口文档的中文技能包；也可直接下载技能压缩包（文档站路径：`/downloads/nenoai-api-skill.zip`）或完整技能文件（文档站路径：`/downloads/nenoai-api.SKILL.md`）。

<a id="key"></a>

## 准备：拿到秘钥

`/api/v1/ext/` 下的业务请求用**项目 API 秘钥**鉴权——一个 `npk_` 开头的长字符串，由项目拥有者在项目界面生成：进入项目 → 左上角项目名旁的齿轮「项目设置」→「API 秘钥」→ 生成。

注意：

- 明文秘钥**只在生成/更换时显示一次**，请立即保存；
- 每个项目同时只有一个有效秘钥，「更换」会让旧秘钥立即失效；
- 秘钥的操作权限等同项目拥有者（含消耗归属），请像密码一样保管。

<a id="first-request"></a>

## 第一个请求

```bash
KEY="npk_你的秘钥"
HOST="https://你的站点地址"

curl -H "Authorization: Bearer $KEY" $HOST/api/v1/ext/project
```

返回项目信息与秘钥有效期（`expires_at` 为 `null` 表示永久）：

```json
{
  "project": { "id": "f1e7c2d1-…", "name": "市场部项目" },
  "key": {
    "created_at": "2026-09-06T01:22:19+08:00",
    "expires_at": "2026-10-06T01:22:19+08:00",
    "last_used_at": "2026-09-06T01:22:25+08:00"
  }
}
```

能拿到这个响应，说明秘钥与网络都通了，可以继续看[助理对话](assistant-api.md)、[任务与助理](tasks.md)和[文件](files.md)接口。

<a id="conventions"></a>

## 通用约定

| 项目 | 约定 |
|---|---|
| 基础地址 | `https://你的站点地址/api/v1`，外部接口都在 `/api/v1/ext/` 下 |
| 鉴权 | `/ext` 业务接口使用请求头 `Authorization: Bearer npk_…`（`Bearer` 大小写不敏感，秘钥大小写必须保持原样） |
| 编码 | 请求与响应均为 UTF-8 JSON（文件上传/下载除外，见文件章节） |
| 项目归属 | 秘钥绑定签发它的项目，接口里**不需要也不能**指定项目 ID——拿别的项目的资源一律 404 |

错误响应统一是这个格式（`request_id` 用于反馈排查）：

```json
{
  "error": {
    "code": "invalid_key",
    "message": "invalid or expired api key",
    "request_id": "…"
  }
}
```

<a id="manage"></a>

## 查询秘钥状态

项目拥有者可只读查询当前秘钥的元信息，用于页面显示状态、有效期和最近使用时间。此查询需要**项目拥有者的用户登录访问令牌**，不能使用 `npk_` 项目秘钥；普通业务接入无需调用它，也无需获取用户登录令牌。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/projects/:id/api-key` | 当前秘钥元信息；无则 `{"api_key": null}`，不返回秘钥明文 |

查询成功返回 200，使用 `{"api_key": {...}}` 包装。元信息包含 `id`、`key_hint`、`created_at`、`expires_at`、`last_used_at`；`key_hint` 是用于辨认秘钥的部分字符，不能替代实际秘钥。`expires_at` 为 `null` 表示永久有效，已过期但未吊销的记录仍会返回，页面可据此显示「已过期」。非拥有者返回 403 `owner_only`，项目不存在或不可访问返回 404。

需要生成、更换或吊销秘钥时，由项目拥有者在平台「项目设置 → API 秘钥」中操作。外部程序使用配置好的项目秘钥调用业务接口。

<a id="errors"></a>

## 错误码

| 状态码 | 错误代码 | 含义 |
|---|---|---|
| 401 | `invalid_key` | 秘钥缺失/错误/已吊销/已过期（不区分原因，防探测） |
| 503 | `auth_unavailable` | 认证查询服务暂不可用，按 `Retry-After` 重试；不会计为错误秘钥处罚 |
| 408 | `request_cancelled` | 认证查询期间请求被取消，可在网络恢复后重新请求 |
| 429 | `rate_limited` | 调用过快或连续鉴权失败；按响应 `Retry-After` 指定秒数等待后重试 |
| 400 | `invalid_request` | 参数缺失或格式错误 |
| 400 | `invalid_query` / `invalid_task_type` / `invalid_reference` / `invalid_dependency` | 分页参数错误 / 任务类型错误 / 助理引用无效 / 前置依赖无效 |
| 400 | `invalid_path` / `is_directory` / `no_agent` | 路径非法 / 传了目录 / 任务未指派助理 |
| 400 | `managed_content` | 原生多维表格不能通过普通文件上传接口创建或覆盖 |
| 404 | `not_found` | 资源不存在，**或不属于本秘钥的项目**（两者同应答） |
| 409 | `conflict` | 上传同名文件未允许覆盖 |
| 409 | `request_conflict` | 同一任务创建请求键被用于不同内容，应查询原任务或为新任务使用新键 |
| 409 | `file_modified` | 条件覆盖时文件已被其他写入修改或删除，应重新读取并合并 |
| 409 | `illegal_transition` / `blocked` / `turn_running` / `has_running` | 任务流转不合法 / 被前置依赖挡住 / 已有执行进行中 / 收尾进行中 |
| 413 | `quota_exceeded` | 超出项目拥有者的存储配额 |
| 503 | `busy` | 执行并发已满，稍后重试 |

<a id="limits"></a>

## 限制

- 单请求体积上限 64MB（裸字节上传 50MB）；无断点/分片。
- 任务执行消耗（对话、工具调用）计入**项目拥有者**的能量账户，与页面上操作一致。
- 秘钥到期即失效；更换时旧秘钥会立即失效，没有新旧秘钥同时有效的过渡期。先准备好调用方的配置更新，再生成新秘钥并及时替换；生成到替换完成之间，仍使用旧秘钥的请求会收到 401。
