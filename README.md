# 小能 AI API 工作台

**小能 AI 官方网站：[www.xiaoneng-ai.com](https://www.xiaoneng-ai.com)**

## 小能 AI 简介

小能 AI 是一个云端 AI 助理平台，支持通过对话完成文档编写、表格整理、图片与音视频创作，以及网站和工具原型开发。平台提供项目空间、多维表格、任务流和团队协作功能，用于组织资料、跟踪任务和保存工作成果。

开发者可以通过项目 API 调用已有助理，发起同步、流式或异步对话，管理项目任务和文件，将这些能力接入自己的应用与自动化流程。

## 关于本项目

小能 AI 官方 API 示例项目，使用 React、TypeScript 和 Node.js 构建。提供助理对话、任务管理、项目文件和 API 调试器，覆盖 **35 个项目接口 + 1 个拥有者查询接口**。

**不预填 API 地址、文档站地址或 Key。** 首次启动后，由使用者在「连接配置」中填写。

## 快速开始

需要 Node.js 22.13+ 和 npm。以下命令适用于 Linux、macOS 或 WSL。

```bash
git clone https://github.com/xuzhiping7/neno_ai_example.git
cd neno_ai_example
npm ci
cp .env.example .env
npm run build
npm start
```

打开 **http://localhost:7777**，进入「连接配置」，填写 API 域名和项目 Key，点击「保存并测试连接」。配置保存到服务端 `.env`，重启后保留。

开发模式使用：

```bash
npm run dev
```

开发和生产模式均使用 7777 端口，启动其中一种即可。

## 连接配置

| 字段 | 填写方式 |
| --- | --- |
| API 域名 / 主机 | 填写自己的服务地址，包含 `http://` 或 `https://`，不包含 `/api/v1`。例如 `https://api.example.com`，仅为格式示例 |
| API 端口 | 使用自定义端口时填写；留空使用地址的默认端口（HTTP 80 / HTTPS 443） |
| 项目 API Key | 填写项目设置中生成的完整 `npk_` 密钥 |
| 文档站地址 | 选填，填写文档站根地址，不包含 `/api-docs`；留空时不显示文档下载链接 |
| 拥有者访问令牌 | 选填，仅查询密钥元信息的接口需要项目拥有者的用户登录令牌 |

已保存的 Key 不回显，留空表示保留。更换 API 地址或端口时，需要重新输入目标项目的 Key。配置由当前工作台实例的访问者共用；切换连接后会清空当前页面的资源 ID 和请求记录。

也可以直接修改 `.env`，随后重启服务：

```dotenv
APP_HOST=0.0.0.0
APP_PORT=7777
NENO_API_HOST=
NENO_API_PORT=
NENO_API_KEY=
NENO_DOCS_URL=
NENO_OWNER_TOKEN=
API_TIMEOUT_MS=90000
```

`APP_PORT` 是本网站端口，`NENO_API_PORT` 是小能 AI 服务端口，两者独立。没有配置 API 时，网站仍可启动并浏览接口目录和代码示例，不会连接任何默认服务器。

## 页面功能

| 页面 | 功能 |
| --- | --- |
| 概览 | 项目连接状态、功能入口、文档和智能体技能包链接 |
| 助理对话 | 助理选择、历史消息、同步 / SSE / 异步对话、断点续传、执行查询与取消、提问作答、单次工具授权、VM 子任务 |
| 任务管理 | 看板与分页、创建、启动、验收、流转、归档、删除、评论与附件 |
| 项目文件 | 目录浏览、递归列表、批量元数据、文本编辑、条件覆盖、文件下载、上传、历史版本 |
| API 调试器 | 36 个接口的参数表单、真实请求和响应、响应头、cURL / JavaScript / Python 示例 |
| 请求记录 | 最近 100 次请求、耗时与状态、请求和响应详情、JSON 导出；刷新后清空 |
| 连接配置 | 网页配置 API 主机、端口、Key、文档站和可选拥有者令牌 |

详细对应关系见 [API 覆盖表](docs/API-COVERAGE.md)。[API 手册快照](docs/api/quickstart.md)按 2026-10-20 的官方接口文档整理，仓库内链接已改为相对路径。

## 调用方式

浏览器请求本站 `/gateway/:endpoint`，由 Node.js 服务端添加项目 Key，再调用配置的小能 AI API。Key 不进入前端构建、浏览器存储或代码示例。工作台没有额外的登录口令。

- API 主机或 Key 未配置时，请求返回明确的配置提示。
- 文件上传支持 multipart 和原始字节；下载保留二进制内容和文件名。
- SSE 按事件流转发，支持 `since` 和 `Last-Event-ID` 续传。断开观察不会取消后台执行，停止需调用取消接口。
- 新消息使用新的 `client_request_id`；重试复用原编号和参数。
- 文件编辑使用 `X-File-Key` / `version` 作为 `expect_key`，发生冲突时保留编辑内容。历史版本下载使用历史记录的 `id`。
- 工具授权只允许或拒绝本次调用，不设置账号级自动授权。
- 项目 Key 不支持的文件删除、文件移动、原生表记录编辑等接口不在此项目中提供。

真实 API 操作和助理执行会作用于 Key 对应的项目，消耗规则与平台一致。

## 测试

```bash
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

浏览器测试需要网站运行在 `http://127.0.0.1:7777`，可用 `TEST_BASE_URL` 指定其他地址。已有 Chromium 可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定路径。

测试包含空配置启动、首次配置、代理和文件传输、SSE 分帧、任务和对话交互，以及桌面和 320 / 360 / 390 / 768px 布局。涉及真实项目的浏览器测试，在没有配置 Key 时跳过；其他测试使用隔离数据。

配置自己的测试项目后，可显式运行真实接口验收：

```bash
npm run test:live
# 可选：增加一次简短的真实助理对话
RUN_LIVE_CHAT=1 npm run test:live
```

该脚本创建并删除自己的临时任务，保留一份 `developer-demo/workbench-check-*.md` 作为文件示例，报告写入 `artifacts/live-api-report.json`。项目 API 没有文件删除接口，因此示例文件需在平台中手动删除。

## 服务托管

[systemd 配置示例](infra/neno-ai-example.service)默认工作目录为 `/opt/neno_ai_example`。部署时修改为实际目录，完成构建后安装：

```bash
sudo cp infra/neno-ai-example.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now neno-ai-example
```

查看状态与日志：

```bash
systemctl status neno-ai-example
journalctl -u neno-ai-example -n 50
```

更新代码后，运行 `npm run build`，再执行 `sudo systemctl restart neno-ai-example`。

## 目录结构

```text
shared/catalog.ts       API 契约、参数和路由白名单
server/                 配置保存、API / SSE / 文件代理
src/pages/              工作台页面
src/components/official 官方 Logo 组件
src/lib/                请求、SSE、代码示例和请求记录
tests/                  协议、代理与浏览器测试
scripts/live-smoke.ts    真实接口验收
docs/                   API 手册和接口覆盖表
infra/                  服务托管示例
```

`.env`、依赖、构建文件、日志和测试产物已被 Git 忽略。`.env.example` 只包含空配置，不包含测试服务器地址或凭据。

官方 Logo 保留原始组件；字体使用本地资源，许可文件位于 `public/fonts/`。
