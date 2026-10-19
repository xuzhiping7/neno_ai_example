import { test, expect } from '@playwright/test';

test('First setup starts blank, accepts a default port and derives all document links from configuration', async ({ page }) => {
  let config = { apiBase: '', apiHost: '', apiPort: null as number | null, docsUrl: '', port: 7777, apiConfigured: false, keyConfigured: false, ownerConfigured: false, endpointCount: 36, projectEndpointCount: 35 };
  const saves: any[] = [];
  const requests: string[] = [];
  await page.route('**/workbench/config', async route => {
    if (route.request().method() === 'PUT') {
      const value = route.request().postDataJSON(); saves.push(value);
      config = { ...config, apiHost: value.apiHost, apiPort: value.apiPort ?? 443, apiBase: `${value.apiHost}/api/v1`, docsUrl: value.docsUrl, apiConfigured: true, keyConfigured: true };
      await route.fulfill({ json: { saved: true } });
    } else await route.fulfill({ json: config });
  });
  await page.route('**/gateway/**', route => {
    const id = new URL(route.request().url()).pathname.split('/').pop(); requests.push(id!);
    return route.fulfill({ json: id === 'project' ? { project: { id: 'setup-project', name: '首次配置项目' }, key: { expires_at: null } } : { agents: [] } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '配置文档站地址', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '测试连接', exact: true })).toBeDisabled();
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: '配置文档站地址', exact: true }).click();
  await expect(page.getByLabel('API 域名 / 主机')).toHaveValue('');
  await expect(page.getByLabel('API 端口', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('文档站地址', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('项目 API Key')).toHaveValue('');
  await page.getByLabel('API 域名 / 主机').fill('https://api.example.com');
  await page.getByLabel('项目 API Key').fill('npk_example_setup_NOT_A_REAL_KEY');
  await page.getByRole('button', { name: '保存并测试连接' }).click();
  await expect(page.getByRole('button', { name: '项目已连接' })).toBeVisible();
  expect(saves[0]).toMatchObject({ apiHost: 'https://api.example.com', apiPort: null, docsUrl: '' });
  await page.getByRole('button', { name: '概览', exact: true }).click();
  await expect(page.locator('.start-resources a')).toHaveCount(0);
  await page.getByRole('button', { name: '连接配置', exact: true }).click();
  await page.getByLabel('文档站地址', { exact: true }).fill('https://docs.example.com');
  await page.getByRole('button', { name: '保存并测试连接' }).click();
  await expect(page.getByRole('status')).toContainText('配置已保存');
  await page.getByRole('button', { name: '概览', exact: true }).click();
  await expect(page.getByRole('link', { name: 'API 文档', exact: true })).toHaveAttribute('href', 'https://docs.example.com/api-docs/quickstart');
  await expect(page.getByRole('link', { name: '下载智能体技能包', exact: true })).toHaveAttribute('href', 'https://docs.example.com/downloads/nenoai-api-skill.zip');
  await expect(page.getByRole('link', { name: '下载单文件技能', exact: true })).toHaveAttribute('href', 'https://docs.example.com/downloads/nenoai-api.SKILL.md');
});
