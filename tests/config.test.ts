import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { loadConfig } from '../server/config';

test('A fresh install and the example env have no API host, docs host or credentials', async () => {
  for (const env of [{}, parse(await readFile('.env.example'))]) {
    const config = loadConfig(env);
    assert.equal(config.upstream, '');
    assert.equal(config.docsUrl, '');
    assert.equal(config.apiKey, '');
    assert.equal(config.ownerToken, '');
    assert.equal(config.port, 7777);
  }
});

test('API ports default to the chosen URL scheme and explicit ports remain configurable', () => {
  assert.equal(loadConfig({ NENO_API_HOST: 'https://api.example.com' }).upstream, 'https://api.example.com');
  assert.equal(loadConfig({ NENO_API_HOST: 'http://api.example.com', NENO_API_PORT: '9001' }).upstream, 'http://api.example.com:9001');
  assert.equal(loadConfig({ NENO_API_HOST: 'https://api.example.com', NENO_DOCS_URL: '' }).docsUrl, '');
  assert.throws(() => loadConfig({ NENO_API_HOST: 'https://api.example.com/path' }));
  assert.throws(() => loadConfig({ NENO_DOCS_URL: 'javascript:alert(1)' }));
});
