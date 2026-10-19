import { useEffect, useRef, useState } from 'react';
import { Check, Code2, Play, RotateCcw, Search, Square } from 'lucide-react';
import { endpoints, byId, groups } from '../../shared/catalog';
import { useWorkbench } from '../context';
import { api, ApiError, pretty, uuid, type ApiResult } from '../lib/api';
import { snippets } from '../lib/snippets';
import { Badge, Button, Code, CopyButton, DocLink, Empty, ErrorBox, Field, Method, PageHeading } from '../components/ui';
import type { StreamEvent } from '../lib/sse';
export function Explorer({ endpointId }: { endpointId: string }) {
  const { config, refs, setRefs, navigate, configure } = useWorkbench();
  const endpoint = byId[endpointId] || byId.project;
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState('json');
  const [targetPath, setTargetPath] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [tab, setTab] = useState('响应');
  const [language, setLanguage] = useState<'curl' | 'JavaScript' | 'Python'>('curl');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort(); setBusy(false); setResult(null); setError(null); setEvents([]); setFiles([]); setAck(false); setMode('json'); setOverwrite(false); setTargetPath('');
    setValues(Object.fromEntries((endpoint.fields || []).map(field => [field.name, refs[field.name] || field.default || ''])));
    setBody(endpoint.input === 'raw' ? '# Hello, Neno AI\n\n这是从开发者工作台写入的文件。\n' : endpoint.body ? JSON.stringify(endpoint.body, null, 2).replaceAll('{{uuid}}', uuid()) : '');
    return () => controller.current?.abort();
  }, [endpoint.id]);
  let parsed: any;
  try { parsed = endpoint.input === 'raw' ? body : body ? JSON.parse(body) : undefined; } catch { parsed = undefined; }
  const sampleBody = endpoint.input === 'multipart' ? { ...(targetPath ? { path: targetPath } : {}), overwrite: String(overwrite) } : parsed;
  const code = snippets(endpoint, values, sampleBody, config.apiBase, mode);
  async function execute(event: React.FormEvent) {
    event.preventDefault(); if (!config.apiBase || (endpoint.owner ? !config.ownerConfigured : !config.keyConfigured)) { configure(); return; }
    setError(null); setEvents([]); setResult(null);
    try {
      let payload: any;
      if (endpoint.input === 'multipart' || (endpoint.input === 'comment' && mode === 'multipart')) {
        if (endpoint.input === 'multipart' && !files[0]) throw new Error('请选择要上传的文件');
        if (files.reduce((n, file) => n + file.size, 0) > 50 * 1024 * 1024) throw new Error('上传文件总大小不能超过 50 MiB');
        payload = new FormData();
        if (endpoint.input === 'multipart') { payload.append('file', files[0]); if (targetPath) payload.append('path', targetPath); payload.append('overwrite', String(overwrite)); }
        else { const json = JSON.parse(body); for (const [key, value] of Object.entries(json)) payload.append(key, typeof value === 'string' ? value : JSON.stringify(value)); files.forEach(file => payload.append('files', file)); }
      } else if (endpoint.input === 'raw') { if (files[0]?.size > 50 * 1024 * 1024) throw new Error('文件不能超过 50 MiB'); payload = files[0] || body; }
      else if (endpoint.input) payload = JSON.parse(body);
      setBusy(true); setTab('响应'); controller.current = new AbortController();
      const response = await api(endpoint.id, values, payload, { signal: controller.current.signal, onEvent: event => {
        setEvents(old => [...old, event].slice(-250));
        if (event.event === 'accepted') setRefs({ conversationId: event.data.conversation_id, turnId: event.data.turn_id });
      } });
      setResult(response);
      const data = response.data;
      if (endpoint.id === 'task-create' && data?.id) setRefs({ taskId: data.id });
      if (endpoint.id === 'comment-create' && data?.id) setRefs({ commentId: data.id });
      if ((endpoint.id === 'file-put' || endpoint.id === 'file-upload') && data?.id) setRefs({ fileId: data.id, path: data.path || values.path || targetPath });
      if (data?.conversation_id) setRefs({ conversationId: data.conversation_id, turnId: data.turn_id || '' });
    } catch (e) { if ((e as Error).name !== 'AbortError') setError(e); if (e instanceof ApiError) setResult(e.result); }
    finally { setBusy(false); }
  }
  const filtered = endpoints.filter(e => `${e.title} ${e.method} ${e.path}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <PageHeading title="API 调试器"><Badge>36 个接口</Badge></PageHeading>
    <div className="explorer-layout">
      <aside className="endpoint-list">
        <div className="search-field"><Search size={15} /><input aria-label="搜索接口" placeholder="搜索名称、路径…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        {Object.entries(groups).map(([key, group]) => { const items = filtered.filter(e => e.group === key); return items.length ? <div key={key} className="endpoint-group"><div className="endpoint-group-title">{group.title}<span>{items.length}</span></div>{items.map(e => <button key={e.id} onClick={() => navigate('explorer', e.id)} className={`endpoint-item ${e.id === endpoint.id ? 'selected' : ''}`}><Method value={e.method} /><span>{e.title}</span></button>)}</div> : null; })}
        {filtered.length === 0 && <p className="muted small">没有匹配的接口</p>}
      </aside>
      <div className="endpoint-detail">
        <div className="endpoint-intro"><h2>{endpoint.title}</h2><div className="endpoint-path"><Method value={endpoint.method} /><code>/api/v1{endpoint.path}</code><CopyButton text={`/api/v1${endpoint.path}`} label="复制路径" /></div><p>{endpoint.description}</p><DocLink url={config.docsUrl ? `${config.docsUrl}/api-docs/${endpoint.doc}` : undefined} /></div>
        <div className="endpoint-workspace">
          <form className="request-panel" onSubmit={execute}>
            <div className="panel-title"><h3>请求参数</h3><button type="button" className="icon-button" title="重新填入当前资源 ID" aria-label="重新填入当前资源 ID" onClick={() => setValues(old => ({ ...old, ...Object.fromEntries((endpoint.fields || []).filter(f => refs[f.name]).map(f => [f.name, refs[f.name]])) }))}><RotateCcw size={14} /></button></div>
            {endpoint.owner && <div className="notice">拥有者登录令牌：{config.ownerConfigured ? '已配置' : '尚未配置 NENO_OWNER_TOKEN'}</div>}
            {(endpoint.fields || []).map(field => <Field key={field.name} label={<>{field.label} {field.required && <b className="required">*</b>} <code>{field.name}</code></>}><>{field.options ? <select value={values[field.name] || ''} onChange={e => setValues(old => ({ ...old, [field.name]: e.target.value }))}>{field.options.map(value => <option key={value} value={value}>{value || '不传'}</option>)}</select> : <input required={field.required} value={values[field.name] || ''} placeholder={field.placeholder || '可选'} onChange={e => setValues(old => ({ ...old, [field.name]: e.target.value }))} />}</></Field>)}
            {endpoint.input === 'comment' && <Field label="提交格式"><select value={mode} onChange={e => setMode(e.target.value)}><option value="json">JSON · 引用已有文件</option><option value="multipart">Multipart · 同时上传附件</option></select></Field>}
            {endpoint.input && endpoint.input !== 'multipart' && <Field label={endpoint.input === 'raw' ? '原始文本（或选择本地文件）' : 'JSON 请求体'} hint={endpoint.id === 'chat' || endpoint.id === 'task-create' ? '重试沿用原编号和参数；新请求需新编号。' : undefined}><textarea spellCheck={false} className="json-editor" rows={endpoint.id === 'chat' ? 10 : 8} value={body} onChange={e => setBody(e.target.value)} /></Field>}
            {(endpoint.id === 'chat' || endpoint.id === 'task-create') && <Button type="button" kind="ghost" onClick={() => { try { const next = JSON.parse(body); next.client_request_id = uuid(); setBody(pretty(next)); } catch { setError(new Error('请先修正 JSON 格式')); } }}>生成新请求编号</Button>}
            {(endpoint.input === 'multipart' || endpoint.input === 'raw' || endpoint.input === 'comment' && mode === 'multipart') && <><Field label="本地文件"><input key={`${endpoint.id}-${files.length === 0}`} type="file" multiple={endpoint.input === 'comment'} onChange={e => setFiles(Array.from(e.target.files || []))} /></Field>{files.length > 0 && <button type="button" className="text-link" onClick={() => setFiles([])}>清除已选文件</button>}</>}
            {endpoint.input === 'multipart' && <><Field label="目标路径（可选）"><input value={targetPath} onChange={e => setTargetPath(e.target.value)} placeholder="developer-demo/example.txt" /></Field><label className="checkbox-label"><input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />允许覆盖同名文件</label></>}
            {!endpoint.input && !endpoint.fields?.length && <div className="no-params"><Check size={18} />无需填写参数，可以直接请求。</div>}
            {endpoint.caution && <label className="caution-checkbox"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /><span>{endpoint.caution}</span></label>}
            <ErrorBox error={error} />
            <div className="request-actions"><Button type="submit" kind="primary" loading={busy} disabled={!!endpoint.caution && !ack}><Play size={14} />发送请求</Button>{busy && <Button type="button" onClick={() => controller.current?.abort()}><Square size={13} />停止观察</Button>}</div>
            <div className="request-footnote">服务端自动添加 Authorization。</div>
          </form>
          <section className="response-panel">
            <div className="panel-tabs">{['响应', '调用代码', '响应头'].map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}{result && <span className={`response-status ${result.status >= 400 ? 'failed' : ''}`}>{result.status} · {result.duration} ms</span>}</div>
            {tab === '调用代码' ? <><div className="language-tabs">{(['curl', 'JavaScript', 'Python'] as const).map(lang => <button key={lang} className={lang === language ? 'active' : ''} onClick={() => setLanguage(lang)}>{lang}</button>)}<CopyButton text={code[language]} /></div><Code value={code[language]} dark /></> : tab === '响应头' ? <Code value={result?.headers || { 提示: '发送请求后显示 X-File-Key、Retry-After 等响应头。' }} /> : result ? <Code value={result.data === null ? '204 No Content · 操作成功，无响应体' : result.data} title="响应体" /> : events.length ? <div className="event-list">{events.map((event, i) => <div key={i}><Badge>{event.event}</Badge><code>{pretty(event.data)}</code></div>)}</div> : <Empty title={busy ? '等待接口响应…' : '暂无响应'} icon={<Code2 size={28} />}><p>发送请求后显示结果。</p></Empty>}
          </section>
        </div>
      </div>
    </div>
  </>;
}
