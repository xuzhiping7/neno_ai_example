import { useState } from 'react';
import { ArrowRight, Braces, FolderOpen, Layers3, MessageSquare } from 'lucide-react';
import { useWorkbench } from '../context';
import { api, type ApiResult } from '../lib/api';
import { Button, Code, ErrorBox, PageHeading } from '../components/ui';

export function Overview() {
  const { config, project, navigate } = useWorkbench();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [response, setResponse] = useState<ApiResult | null>(null);

  async function test() {
    setBusy(true); setError(null);
    try { setResponse(await api('project')); }
    catch (error) { setError(error); }
    finally { setBusy(false); }
  }

  const features = [
    { page: 'explorer' as const, title: 'API 调试器', description: '发送请求，查看响应，复制代码。', icon: Braces },
    { page: 'chat' as const, title: '助理对话', description: '发送消息，查看执行状态，处理授权。', icon: MessageSquare },
    { page: 'tasks' as const, title: '任务管理', description: '创建、启动、验收和归档任务。', icon: Layers3 },
    { page: 'files' as const, title: '项目文件', description: '上传、下载、编辑和查看历史版本。', icon: FolderOpen },
  ];

  return <div className="overview-page">
    <PageHeading title="API 工作台" />
    <section className="panel start-connection" aria-label="项目连接">
      <div className="start-connection-details">
        <div><span>当前项目</span><strong>{project?.project.name || '未连接'}</strong></div>
        <div><span>API 地址</span><code>{config.apiBase || '未配置'}</code></div>
      </div>
      <div className="start-connection-actions">
        <a className="button" href="#settings" onClick={event => { event.preventDefault(); navigate('settings'); }}>连接配置</a>
        <Button kind="primary" loading={busy} disabled={!config.apiConfigured} onClick={test}>测试连接</Button>
      </div>
    </section>
    <ErrorBox error={error} />
    {response && <details className="start-response"><summary>连接成功 · {response.duration} ms · 查看响应</summary><Code value={response.data} /></details>}
    <nav className="start-features" aria-label="功能入口">
      {features.map(feature => <a key={feature.page} href={`#${feature.page}`} onClick={event => { event.preventDefault(); navigate(feature.page); }}>
        <feature.icon size={21} />
        <div><h2>{feature.title}</h2><p>{feature.description}</p></div>
        <ArrowRight size={16} />
      </a>)}
    </nav>
    <div className="start-resources">
      {config.docsUrl ? <>
      <a href={`${config.docsUrl}/api-docs/quickstart`} target="_blank" rel="noreferrer">API 文档</a>
      <a href={`${config.docsUrl}/downloads/nenoai-api-skill.zip`} download>下载智能体技能包</a>
      <a href={`${config.docsUrl}/downloads/nenoai-api.SKILL.md`} target="_blank" rel="noreferrer">下载单文件技能</a>
      </> : <button className="text-link" onClick={() => navigate('settings')}>配置文档站地址</button>}
    </div>
  </div>;
}
