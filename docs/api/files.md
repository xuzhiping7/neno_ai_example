# 文件 API

用项目秘钥访问项目目录里的文件：列目录、递归清单、批量查询元数据、读文本、下载、上传。上传消耗计入项目拥有者的存储配额（与页面上传一致）。

<a id="paths"></a>

## 路径约定

- 项目内**相对路径**：`reports/周报.pdf`；不以 `/` 开头；
- `..` 段拒绝（400 `invalid_path`），`.` 与空段忽略，段两侧空白去除；
- 上传时中间目录自动创建；
- 列目录的 `path` 必须是已存在的目录（空 = 根）。
- 查询参数必须做 URL 编码，尤其是中文、空格、`&`、`#`、`+`。GET 请求可用 curl 的 `--get --data-urlencode 'path=reports/周报.md'`，程序调用请使用 HTTP 客户端的参数编码功能。

<a id="list"></a>

## 列目录

`GET /api/v1/ext/files?path=<目录>` 默认返回直接子项，保留原有 files 数组和节点字段，附带项目相对路径、内容摘要和版本。增加 `recursive=true` 可一次获取全部后代文件和目录的平铺清单，不包含查询目录本身；path 空表示整个项目。

```bash
curl --fail-with-body --get -H "Authorization: Bearer $KEY" \
  --data-urlencode 'path=reports' --data-urlencode 'recursive=true' \
  "$HOST/api/v1/ext/files"
```

```json
{
  "path": "reports", "recursive": true, "count": 2, "complete": true,
  "files": [
    {
      "id": "a1b2…", "path": "reports/周报.pdf", "name": "周报.pdf", "kind": "file",
      "content_type": "file", "size": 102400,
      "content_sha256": "64位小写十六进制摘要", "version": "不透明内容版本标识",
      "created_at": "…", "updated_at": "…"
    },
    {
      "id": "c3d4…", "path": "reports/数据", "name": "数据", "kind": "dir",
      "size": 0, "content_sha256": null, "version": null
    }
  ]
}
```

默认仍只查一层，排序保持原有规则；递归结果按完整相对路径自然排序。count 包括文件和目录。空目录返回 files 空数组、count 为 0、complete 为 true；不存在的目录返回 404，不能当作空目录。

当前不分页、不静默截断。只有完整查询成功才返回 complete 为 true。目录解析和枚举使用同一数据库查询快照，不会锁定文件，响应后仍可能有修改。基础元数据直接读数据库，不下载 COS 等对象存储中的文件。

<a id="metadata-fields"></a>

### 元数据字段

| 字段 | 含义 |
|---|---|
| id | 文件或目录 ID；同路径删除后重建会有新 ID |
| path | 规范化的项目根相对路径，不是相对于查询子目录的路径 |
| kind / content_type | kind 为 file/dir；普通文件的 content_type 为 file，原生多维表格为 bitable |
| size | 原始文件字节数，不是字符数 |
| content_sha256 | 原始字节 SHA-256，小写十六进制；目录或摘要不可用时为 null |
| version | 与读取/按 ID 下载的 X-File-Key 兼容，原样传给 expect_key；目录或无可用版本时为 null |
| created_at / updated_at | 创建/更新时间，不能仅凭时间判断内容相同 |

客户端应对实际待上传字节计算摘要，不自动改变编码或换行；不能把 null 当作空文件摘要。页面保存、助理编辑、API 上传和历史恢复都会反映到当前元数据，没有独立同步缓存。

version 是不透明的内容版本，不是递增保存次数或历史序号。重复保存相同内容、恢复旧内容时可能复用版本；同路径重建需同时比较 ID。即使当前版本值恰好等于摘要，也不能依赖这种实现细节或自行计算版本。

<a id="batch-metadata"></a>

## 批量查询元数据

`POST /api/v1/ext/files/metadata`，一次传入 1–500 个路径，JSON 不超过 1 MiB。它是只读查询，归档项目也可调用。

```json
{"paths": ["reports/周报.pdf", "reports", "missing.md"]}
```

```json
{
  "count": 3, "complete": true,
  "results": [
    {
      "requested_path": "reports/周报.pdf", "path": "reports/周报.pdf", "status": "found",
      "id": "a1b2…", "name": "周报.pdf", "kind": "file", "size": 102400,
      "content_sha256": "64位摘要", "version": "不透明内容版本标识", "updated_at": "…"
    },
    {
      "requested_path": "reports", "path": "reports", "status": "is_directory",
      "id": "c3d4…", "kind": "dir", "content_sha256": null, "version": null
    },
    {"requested_path": "missing.md", "path": "missing.md", "status": "not_found"}
  ]
}
```

每项按输入顺序返回，重复项也保留；命中项含与目录列表一致的完整节点字段。requested_path 是原始输入，path 是规范化路径；非法路径保留原输入并返回 invalid_path。文件返回 found；只有目录时返回 is_directory；若同名文件与目录同时存在，优先返回文件，与文件读取语义一致。

空数组、缺少 paths、类型错误或超过 500 项返回 400，不丢弃超限项。失效秘钥返回 401。complete 为 true 表示每项均已处理，不表示每个文件都存在；数据库错误不会转成 not_found。有效路径在一次数据库查询中读取，不逐个访问对象存储。

<a id="client-sync"></a>

### 客户端同步用法

1. 同步整个目录时调用递归列目录；只查零散文件时调用批量查询。
2. 客户端比较本地摘要与 content_sha256，自行决定跳过、覆盖、冲突处理或记录同步结果。
3. 使用现有上传接口写入变化的文件；需要条件覆盖时传回服务端 version。
4. 上传超时或需要确认结果时，把待确认路径一起批量查询。

接口只提供当前状态，不维护来源、成功同步基线或批次，不自动覆盖、合并或删除。两种查询均返回 `Cache-Control: no-store`。

<a id="read"></a>

## 读文本内容

`GET /api/v1/ext/files/read?path=<文件>` —— 响应体就是文件内容（`text/plain`），适合 md/txt/csv 等。

响应头 `X-File-Key` 是本次读取的内容版本标识，可用于下方的条件覆盖。

```bash
curl -H "Authorization: Bearer $KEY" "$HOST/api/v1/ext/files/read?path=notes/备忘.md"
```

<a id="download"></a>

## 下载文件

两种寻址，返回都是原始字节流（`Content-Type` 按扩展名推断；可预览类型 `inline`，其余 `attachment`）：

```bash
# 按路径（推荐，外部系统自然标识）
curl -H "Authorization: Bearer $KEY" -o 周报.pdf \
  "$HOST/api/v1/ext/files/download?path=reports/周报.pdf"

# 按文件 id（列目录返回的 id）
curl -H "Authorization: Bearer $KEY" -o 周报.pdf \
  "$HOST/api/v1/ext/files/a1b2…"
```

传了目录路径返回 404（目录不可下载）；文件不存在 404。

<a id="history"></a>

## 文件历史与指定版本下载

先通过列目录或批量元数据接口取得文件的 `id`（下方 `nodeId`），再查询历史：

```bash
curl --fail-with-body -H "Authorization: Bearer $KEY" \
  "$HOST/api/v1/ext/files/<nodeId>/versions"
```

成功返回 200，`versions` 按历史序号从新到旧排列：

```json
{
  "versions": [{
    "id": "历史版本UUID", "node_id": "文件UUID", "version_no": 2,
    "size": 1024, "created_by": "操作用户UUID",
    "created_at": "2026-09-30T08:00:00Z",
    "source": "save", "is_current": false
  }]
}
```

| 字段 | 含义 |
| --- | --- |
| `id` | 历史版本 ID，下载时作为 `versionId` 使用 |
| `node_id` | 所属文件 ID |
| `version_no` | 显示用历史序号，不是下载地址中的版本 ID |
| `size` | 该历史版本的原始字节数 |
| `created_at` / `created_by` | 历史记录的创建时间和操作用户；创建者可能缺省 |
| `source` | `save`：覆盖保存时记录；`rollback`：恢复历史时保存被替换的内容 |
| `is_current` | 该记录内容是否与当前文件一致；恢复旧内容后可能为 true |

使用列表中的版本 `id` 下载原始内容：

```bash
curl --fail-with-body -H "Authorization: Bearer $KEY" \
  --output './周报.v2.pdf' \
  "$HOST/api/v1/ext/files/<nodeId>/versions/<versionId>/content"
```

响应为 200 和**所选历史版本的原始字节流**，不是 JSON 包装，也不会把历史内容恢复或覆盖到当前文件。响应类型与普通下载一致；文件名和类型按当前文件名称处理。客户端可用 `--output` 自行指定包含版本号的保存名。

`versionId`、`version_no` 和当前文件元数据中的 `version` 是三个不同字段：历史下载必须使用列表里的 `id`；`version` 仍只用于当前内容识别和 `expect_key` 条件覆盖。

文件历史默认关闭，由项目拥有者在页面开启。开启后覆盖不同内容时才记录被替换的旧内容，每个文件最多保留 20 条；未开启期间的修改无法补录，重复保存相同内容不会新增历史。关闭历史开关后，已保留的版本仍可查询和下载，直到主动清理或超过保留上限被淘汰。

现存文件没有历史时返回 `{"versions":[]}`。文件改名或移动后，可继续用同一文件 ID 读取历史；删除后同路径重建会产生新 ID，旧版本不能套用到新文件。文件或版本不存在、标识无效、版本不属于该文件或文件不属于秘钥绑定项目，返回 404 `not_found`；目录返回 400 `is_directory`。文件进入回收站后，这两个接口不再返回其历史；在页面恢复文件后可再次读取。归档项目仍可读取历史与下载版本。

列表返回 `Cache-Control: no-store`，内容下载返回 `Cache-Control: private, no-store`。项目秘钥不开放历史开关、历史恢复或删除接口。

<a id="upload"></a>

## 上传：表单

`POST /api/v1/ext/files`，`multipart/form-data` 三字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `file` | 是 | 文件本体 |
| `path` | 否 | 目标路径；缺省用本地文件名 |
| `overwrite` | 否 | `"true"` 才覆盖同名文件 |

```bash
curl -X POST -H "Authorization: Bearer $KEY" \
  -F "file=@周报.pdf" -F "path=reports/周报.pdf" -F "overwrite=true" \
  $HOST/api/v1/ext/files
```

成功 201 返回文件节点 JSON（含 `id`）。同名未覆盖返回 409 `conflict`；超配额 413 `quota_exceeded`。

<a id="put"></a>

## 上传：裸字节

`POST /api/v1/ext/files/put?path=<路径>` —— 请求体整个就是文件字节（≤50MB），**恒覆盖**，适合程序化写入。

```bash
curl -X POST -H "Authorization: Bearer $KEY" --data-binary @图表.png \
  "$HOST/api/v1/ext/files/put?path=images/图表.png"
```

成功 201，直接返回文件节点 JSON（含 `id`、`name`、`kind`、`size`）。不要把文件内容包装成 JSON，也不要把 HTTP 方法写成 `PUT`。

<a id="conditional-write"></a>

### 条件覆盖

读取后再编辑已有文件时，可在 `put` 的查询参数里加 `expect_key`，值为先前读取响应的 `X-File-Key`，或目录/批量查询返回的 `version`。服务器仅在文件版本仍匹配时写入；被他人修改或删除则返回 409 `file_modified`，此时应重新读取、合并修改，再带新的版本标识写入。

例如程序发送 `POST /api/v1/ext/files/put`，查询参数为 `{"path":"notes/备忘.md","expect_key":"读取时的 X-File-Key"}`，请求体为编辑后的原始字节；查询参数交给 HTTP 客户端编码。不传 `expect_key` 会直接覆盖。上传完成后可以再次读取或下载来验证内容。

<a id="errors"></a>

## 错误与限制

| 场景 | 响应 |
|---|---|
| 路径非法（`..`、以 `/` 开头） | 400 `invalid_path` |
| 批量 paths 缺失、空或超过 500 项 | 400 `invalid_request` |
| 批量查询中的单个非法路径 | HTTP 200，该项 status 为 invalid_path |
| 批量查询 JSON 超过 1 MiB | 413 `invalid_request` |
| 无效 recursive 参数 | 400 `invalid_request` |
| 下载/读取目录 | 404（按路径下载）/ `is_directory` |
| 文件/目录不存在 | 404 `not_found` |
| 表单上传同名未开 `overwrite` | 409 `conflict` |
| 条件覆盖版本不匹配或文件已删除 | 409 `file_modified` |
| 普通上传创建/覆盖 `.ntable` 原生表 | 400 `managed_content` |
| 超出存储配额 | 413 `quota_exceeded` |
| 请求体上限 | 全局 64 MiB（包含表单开销）；`put` 50 MiB。超大请求可能返回 400 `invalid_request` 或 413，应先检查大小 |

外部 API 已支持上述上传与整文件覆盖写入；尚未开放独立的局部编辑、删除和移动接口，需要时在页面里操作。

原生多维表格 `.ntable` 可以列出和下载完整快照，但不能通过普通上传或覆盖写入修改；项目秘钥尚未开放原生表记录接口。
