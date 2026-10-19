import express from 'express';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config';
import { createApp } from './app';

const config = loadConfig();
const app = createApp(config);
if (process.env.NODE_ENV === 'production') {
  const directory = fileURLToPath(new URL('../dist', import.meta.url));
  app.use(express.static(directory, { dotfiles: 'deny', index: false }));
  app.get('/{*path}', (req, res) => {
    if (req.path.startsWith('/.') || /\.(env|ts|json|log)$/.test(req.path)) { res.status(404).end(); return; }
    res.sendFile(`${directory}/index.html`);
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(config.port, config.host, () => console.log(`小能 AI 开发者工作台 http://${config.host}:${config.port}`));
server.requestTimeout = 35 * 60 * 1000;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
