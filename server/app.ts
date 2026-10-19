import express, { type Request, type Response, type NextFunction } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { parse } from 'dotenv';
import { loadConfig } from './config';
import { byId, endpoints, resolveEndpoint } from '../shared/catalog';
import type { Config } from './config';

export function createApp(config: Config, options: { envFile?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/gateway') || req.path.startsWith('/workbench')) {
      res.set('Cache-Control', 'no-store');
      const origin = req.get('origin');
      if (req.get('sec-fetch-site') === 'cross-site') { fail(res, 403, 'cross_origin', '请在工作台页面内调用'); return; }
      if (origin) {
        try { if (new URL(origin).host !== req.get('host')) throw new Error(); }
        catch { fail(res, 403, 'cross_origin', '不接受跨站请求'); return; }
      }
    }
    next();
  });
  app.get('/workbench/config', (_req, res) => {
    const address = config.upstream ? new URL(config.upstream) : null;
    const keyConfigured = !!config.apiKey && !config.apiKey.includes('REPLACE_');
    res.json({ apiBase: address ? `${config.upstream}/api/v1` : '', apiHost: address ? `${address.protocol}//${address.hostname}` : '', apiPort: address ? Number(address.port || (address.protocol === 'https:' ? 443 : 80)) : null, docsUrl: config.docsUrl, port: config.port,
      apiConfigured: !!address && keyConfigured, keyConfigured, ownerConfigured: !!config.ownerToken,
      endpointCount: endpoints.length, projectEndpointCount: endpoints.filter(e => !e.owner).length,
    });
  });
  let configWrites = Promise.resolve();
  app.put('/workbench/config', express.json({ limit: '8kb' }), async (req, res) => {
    const save = async () => {
      const { apiHost, apiPort, apiKey, docsUrl, ownerToken, clearOwnerToken } = req.body || {};
      if (typeof apiHost !== 'string' || (apiPort !== null && typeof apiPort !== 'number') || typeof docsUrl !== 'string' || typeof apiKey !== 'string' || typeof ownerToken !== 'string') throw new Error('连接配置格式不正确');
      if (!apiHost.trim()) throw new Error('请填写 API 域名');
      if (apiPort !== null && (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535)) throw new Error('API 端口必须为 1–65535');
      if ([apiHost, docsUrl, apiKey, ownerToken].some(value => /[\r\n\0]/.test(value))) throw new Error('配置不能包含换行或控制字符');
      const next = loadConfig({ APP_HOST: config.host, APP_PORT: String(config.port), NENO_API_HOST: apiHost.trim(), NENO_API_PORT: apiPort === null ? '' : String(apiPort), NENO_API_KEY: apiKey.trim() || config.apiKey, NENO_DOCS_URL: docsUrl, NENO_OWNER_TOKEN: clearOwnerToken ? '' : ownerToken.trim() || config.ownerToken, API_TIMEOUT_MS: String(config.timeout) });
      if (next.upstream !== config.upstream && !apiKey.trim()) throw new Error('更换 API 地址或端口时，请重新输入目标项目的 Key');
      if (next.upstream !== config.upstream && !ownerToken.trim()) next.ownerToken = '';
      if (!next.apiKey.startsWith('npk_') || next.apiKey.length < 16 || /\s/.test(next.apiKey)) throw new Error('项目 Key 应为 npk_ 开头的完整密钥');
      const path = options.envFile || '.env';
      const previous = await readFile(path, 'utf8').catch(() => '');
      const env = { ...parse(previous), APP_HOST: next.host, APP_PORT: String(next.port), NENO_API_HOST: apiHost.trim(), NENO_API_PORT: apiPort === null ? '' : String(apiPort), NENO_API_KEY: next.apiKey, NENO_DOCS_URL: next.docsUrl, NENO_OWNER_TOKEN: next.ownerToken, API_TIMEOUT_MS: String(next.timeout) };
      const text = Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n';
      const temporary = `${path}.pending`;
      try { await writeFile(temporary, text, { mode: 0o600 }); await rename(temporary, path); }
      finally { await unlink(temporary).catch(() => {}); }
      Object.assign(config, next);
    };
    const operation = configWrites.then(save); configWrites = operation.catch(() => {});
    try { await operation; res.json({ saved: true }); }
    catch (error) { fail(res, 400, 'invalid_config', (error as Error).message.startsWith('E') ? '配置保存失败，请检查服务端文件权限' : (error as Error).message); }
  });
  app.all('/gateway/:endpoint', express.raw({ type: () => true, limit: '64mb' }), async (req, res) => {
    const endpoint = byId[String(req.params.endpoint)];
    if (!endpoint || req.method !== endpoint.method) { fail(res, 404, 'unknown_endpoint', '此接口或方法不在公开文档中'); return; }
    if (!config.upstream) { fail(res, 503, 'api_not_configured', '请先在连接配置中填写 API 域名和项目 Key'); return; }
    const credential = endpoint.owner ? config.ownerToken : config.apiKey;
    if (!credential || credential.includes('REPLACE_')) {
      fail(res, 503, endpoint.owner ? 'owner_token_required' : 'key_not_configured', endpoint.owner ? '请在连接配置中填写拥有者令牌；项目 Key 不能调用此接口' : '请在连接配置中填写项目 API Key'); return;
    }
    let path: string;
    try {
      const values: Record<string, string> = {};
      for (const field of endpoint.fields || []) {
        const value = req.query[field.name];
        if (value !== undefined && typeof value !== 'string') throw new Error(`${field.name} 只能提供一次`);
        values[field.name] = (value as string | undefined) || '';
      }
      path = resolveEndpoint(endpoint, values);
    } catch (error) { fail(res, 400, 'invalid_parameters', (error as Error).message); return; }
    if (endpoint.id === 'file-put' && req.body?.length > 50 * 1024 * 1024) { fail(res, 413, 'body_too_large', '原始字节上传不能超过 50 MiB'); return; }
    const headers = new Headers({ Authorization: `Bearer ${credential}` });
    for (const name of ['content-type', 'idempotency-key', 'last-event-id', 'accept']) {
      const value = req.get(name); if (value) headers.set(name, value);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), endpoint.id === 'stream' || endpoint.id === 'chat' ? 30 * 60 * 1000 : config.timeout);
    res.on('close', () => controller.abort());
    try {
      const response = await fetch(`${config.upstream}${path}`, {
        method: endpoint.method, headers, body: ['GET', 'HEAD'].includes(req.method) || !req.body?.length ? undefined : req.body,
        signal: controller.signal, redirect: 'manual',
      });
      res.status(response.status);
      for (const name of ['content-type', 'content-disposition', 'x-file-key', 'retry-after', 'x-request-id', 'location']) {
        const value = response.headers.get(name); if (value) res.set(name, value);
      }
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        res.set('X-Accel-Buffering', 'no'); res.flushHeaders();
      }
      if (response.body) await pipeline(Readable.fromWeb(response.body as never), res);
      else res.end();
    } catch (error) {
      if (!res.headersSent && !res.destroyed) fail(res, 502, 'upstream_unavailable', controller.signal.aborted ? '请求观察已超时。执行可能仍在后台继续，请查询原请求状态。' : '无法连接上游 API，请检查服务端主机和端口配置。');
      else if (!res.destroyed) res.end();
    } finally { clearTimeout(timer); }
  });
  app.use('/gateway', (_req, res) => { fail(res, 404, 'unknown_endpoint', '接口不存在'); });
  app.use((error: { type?: string; message?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) { next(error); return; }
    fail(res, error.type === 'entity.too.large' ? 413 : 400, 'invalid_request', error.type === 'entity.too.large' ? '请求体超过限制' : '请求体格式不正确');
  });
  return app;
}
