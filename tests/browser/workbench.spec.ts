import 'dotenv/config';
import { test, expect } from '@playwright/test';

test('Public landing page, all 36 explorer entries, examples, and mobile navigation', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'API 工作台' })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'artifacts/overview-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'API 调试器' }).click(); await expect(page.locator('.endpoint-item')).toHaveCount(36);
  await page.getByRole('button', { name: '调用代码', exact: true }).click(); await expect(page.locator('.dark-code')).toContainText('NENO_API_KEY');
  await page.getByRole('button', { name: 'JavaScript', exact: true }).click(); await expect(page.locator('.dark-code')).toContainText('process.env.NENO_API_KEY');
  await page.getByLabel('搜索接口').fill('历史'); await expect(page.locator('.endpoint-item')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByLabel('打开导航').click(); await page.getByRole('button', { name: '连接配置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '连接配置', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: 'artifacts/settings-mobile.png', fullPage: true });
  await page.goto('/'); await page.screenshot({ animations: 'disabled', path: 'artifacts/overview-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('Opens without a password, saves configuration and calls real APIs', async ({ page }) => {
  test.skip(!process.env.NENO_API_KEY || process.env.NENO_API_KEY.includes('REPLACE_'), 'Configure a project key to run live browser checks.');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const sessionRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/workbench/session')) sessionRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '项目已连接' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await page.context().cookies()).filter(cookie => cookie.name === 'neno_session')).toEqual([]);
  await page.getByRole('button', { name: '连接配置', exact: true }).click();
  await page.getByRole('button', { name: '保存并测试连接' }).click();
  await expect(page.getByRole('status')).toContainText('配置已保存');
  const publicConfig = await (await page.request.get('/workbench/config')).text();
  expect(publicConfig).not.toContain(process.env.NENO_API_KEY!);
  await page.getByRole('button', { name: 'API 调试器' }).click();
  await page.getByRole('button', { name: '发送请求', exact: true }).click();
  await expect(page.locator('.response-status')).toContainText('200');
  await expect(page.locator('.response-panel')).toContainText('project');
  await page.screenshot({ animations: 'disabled', path: 'artifacts/explorer-desktop.png', fullPage: true });
  for (const label of ['任务管理', '项目文件', '助理对话', '请求记录']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const width of [320, 360, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const hash of ['overview', 'settings', 'explorer/file-put', 'tasks', 'files', 'chat', 'history']) {
      await page.goto(`/#${hash}`); await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: ${hash}`).toBe(true);
    }
  }
  expect(errors).toEqual([]);
  expect(sessionRequests).toEqual([]);
});
