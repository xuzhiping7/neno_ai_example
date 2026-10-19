import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, BookOpen, Boxes, Braces, ChevronRight, CircleHelp, FolderOpen, LayoutDashboard, Menu, MessageSquare, Settings2, ShieldCheck, X } from 'lucide-react';
import { WorkbenchContext, type Config, type Page } from './context';
import { api, history, type Data } from './lib/api';
import { ErrorBox } from './components/ui';
import { NenoBrand } from './components/official/Brand';
import { Overview } from './pages/Overview';
import { Explorer } from './pages/Explorer';
import { Chat } from './pages/Chat';
import { Tasks } from './pages/Tasks';
import { Files } from './pages/Files';
import { HistoryPage, SettingsPage } from './pages/Utilities';

const nav = [
  { id: 'overview', label: '概览', icon: LayoutDashboard },
  { id: 'chat', label: '助理对话', icon: MessageSquare },
  { id: 'tasks', label: '任务管理', icon: Boxes },
  { id: 'files', label: '项目文件', icon: FolderOpen },
  { id: 'explorer', label: 'API 调试器', icon: Braces },
  { id: 'history', label: '请求记录', icon: Activity },
  { id: 'settings', label: '连接配置', icon: Settings2 },
] as const;
const initialConfig: Config = { apiBase: '', apiHost: '', apiPort: null, docsUrl: '', port: 7777, apiConfigured: false, keyConfigured: false, ownerConfigured: false, endpointCount: 36, projectEndpointCount: 35 };

export default function App() {
  const getPage = () => nav.some(n => n.id === location.hash.slice(1).split('/')[0]) ? location.hash.slice(1).split('/')[0] as Page : 'overview';
  const [page, setPage] = useState<Page>(getPage);
  const [endpoint, setEndpoint] = useState(location.hash.split('/')[1] || 'project');
  const [config, setConfig] = useState(initialConfig);
  const [project, setProject] = useState<Data | null>(null);
  const [agents, setAgents] = useState<Data[]>([]);
  const [refs, updateRefs] = useState<Record<string, string>>({});
  const [mobile, setMobile] = useState(false);
  const [connectionError, setConnectionError] = useState<unknown>(null);
  const [toast, setToast] = useState('');
  function navigate(next: Page, id?: string) { location.hash = next + (id ? `/${id}` : ''); setPage(next); if (id) setEndpoint(id); setMobile(false); }
  function notify(text: string) { setToast(text); }
  async function refresh(reset = false) {
    setConnectionError(null);
    if (reset) { setProject(null); setAgents([]); updateRefs({}); history.clear(); }
    const response = await fetch('/workbench/config');
    if (!response.ok) throw new Error('无法读取工作台配置');
    const value: Config = await response.json(); setConfig(value);
    if (value.apiConfigured) {
      const connection = await api('project'); setProject(connection.data);
      updateRefs(old => ({ ...old, projectId: connection.data.project.id }));
      const assistants = await api('agents'); setAgents(assistants.data.agents || []);
      if (assistants.data.agents?.[0]) updateRefs(old => ({ ...old, agentId: old.agentId || assistants.data.agents[0].id }));
    } else { setProject(null); setAgents([]); updateRefs({}); }
  }
  useEffect(() => { refresh().catch(setConnectionError); }, []);
  useEffect(() => { const fn = () => { setPage(getPage()); if (location.hash.split('/')[1]) setEndpoint(location.hash.split('/')[1]); }; window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); } }, [toast]);
  return <WorkbenchContext.Provider value={{ config, project, agents, refs, setRefs: values => updateRefs(old => ({ ...old, ...values })), navigate, configure: () => navigate('settings'), refresh, notify }}>
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <button className="icon-button mobile-menu" aria-label="打开导航" aria-expanded={mobile} onClick={() => setMobile(value => !value)}><Menu size={20} /></button>
          <a className="official-brand-link" aria-label="小能AI API 工作台首页" href="#overview" onClick={() => setMobile(false)}><NenoBrand /></a>
        </div>
        <div className="breadcrumbs"><span className="breadcrumb-root">开发者工作台</span><ChevronRight size={13} /><strong>{nav.find(item => item.id === page)?.label}</strong></div>
        <div className="topbar-right">
          <span className="environment"><span className="status-dot" />测试环境</span>
          {config.docsUrl ? <a className="topbar-doc" href={`${config.docsUrl}/api-docs/quickstart`} target="_blank" rel="noreferrer"><CircleHelp size={16} />文档</a> : <button className="topbar-doc" title="配置文档站地址" onClick={() => navigate('settings')}><CircleHelp size={16} />文档</button>}
          <button className={`connection-button ${project ? 'connected' : ''}`} onClick={() => navigate('settings')}>{project ? <ShieldCheck size={15} /> : <Settings2 size={15} />}{project ? '项目已连接' : '配置连接'}</button>
        </div>
      </header>
      {mobile && <button className="sidebar-backdrop" aria-label="关闭导航" onClick={() => setMobile(false)} />}
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <nav aria-label="主导航">{nav.map((item, index) => <div key={item.id}>{index === 4 && <div className="nav-divider" />}<button aria-label={item.label} aria-current={page === item.id ? 'page' : undefined} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><item.icon size={18} strokeWidth={1.7} /><span>{item.label}</span></button></div>)}</nav>
        <div className="sidebar-bottom">{config.docsUrl ? <a href={`${config.docsUrl}/api-docs/quickstart`} target="_blank" rel="noreferrer" className="sidebar-doc"><BookOpen size={16} />接口文档<ArrowUpRight size={14} /></a> : <button className="sidebar-doc" title="配置文档站地址" onClick={() => navigate('settings')}><BookOpen size={16} />接口文档<ArrowUpRight size={14} /></button>}<div className="sidebar-foot"><span className="status-dot" /> API v1 <span>小能 AI</span></div></div>
      </aside>
      <div className="main-shell">

        <main className={`main-content ${page === 'chat' ? 'chat-main' : ''}`}>
          {!!connectionError && <div className="connection-error"><ErrorBox error={connectionError} /><button className="text-link" onClick={() => refresh().catch(setConnectionError)}>重新检测</button></div>}
          {page === 'overview' && <Overview />}
          {page === 'explorer' && <Explorer endpointId={endpoint} />}
          {page === 'chat' && <Chat />}
          {page === 'tasks' && <Tasks />}
          {page === 'files' && <Files />}
          {page === 'history' && <HistoryPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
    {toast && <div className="toast" role="status"><ShieldCheck size={17} />{toast}<button aria-label="关闭提示" onClick={() => setToast('')}><X size={14} /></button></div>}
  </WorkbenchContext.Provider>;
}
