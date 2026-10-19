import 'dotenv/config';

function port(value: string | undefined, fallback: number) {
  const number = Number(value || fallback);
  if (!Number.isInteger(number) || number < 1 || number > 65535) throw new Error('配置中的端口必须为 1–65535');
  return number;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const host = (env.NENO_API_HOST || '').trim();
  const upstream = host ? new URL(host) : null;
  if (upstream && (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash)) throw new Error('NENO_API_HOST 必须是无路径和凭证的 HTTP(S) 主机地址');
  if (env.NENO_API_PORT?.trim()) {
    const apiPort = port(env.NENO_API_PORT, 80);
    if (upstream) upstream.port = String(apiPort);
  }
  const docsUrl = (env.NENO_DOCS_URL || '').trim().replace(/\/$/, '');
  if (docsUrl) {
    const docs = new URL(docsUrl);
    if (!['http:', 'https:'].includes(docs.protocol) || docs.username || docs.password || docs.pathname !== '/' || docs.search || docs.hash) throw new Error('文档地址必须为 HTTP(S) 站点地址');
  }
  const timeout = Number(env.API_TIMEOUT_MS || 90000);
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 300000) throw new Error('API_TIMEOUT_MS 必须在 1000–300000 之间');
  return {
    host: env.APP_HOST || '0.0.0.0', port: port(env.APP_PORT, 7777), upstream: upstream?.origin || '',
    apiKey: env.NENO_API_KEY || '', ownerToken: env.NENO_OWNER_TOKEN || '',
    docsUrl, timeout,
  };
}
export type Config = ReturnType<typeof loadConfig>;
