import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, Check, ChevronDown, Code2, Cpu, History, MessageSquare, Play, Plus, Radio, RefreshCw, Send, ShieldCheck, Square, Wrench, X } from 'lucide-react';
import { useWorkbench } from '../context';
import { api, messageText, pretty, uuid, type Data } from '../lib/api';
import type { StreamEvent } from '../lib/sse';
import { Badge, Button, Code, Empty, ErrorBox, Field, PageHeading } from '../components/ui';
type ChatMessage = { id: string; role: string; text: string; content?: any };
function normalizeQuestion(question: any) { return question?.question && typeof question.question === 'object' ? { ...question, ...question.question } : question; }
export function Chat() {
  const { config, agents, refs, setRefs, configure, navigate, notify } = useWorkbench();
  const [agentId, setAgentId] = useState(refs.agentId || '');
  const [conversations, setConversations] = useState<Data[]>([]); const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]); const [more, setMore] = useState(false);
  const [message, setMessage] = useState(''); const [mode, setMode] = useState('stream'); const [effort, setEffort] = useState('medium');
  const [turnId, setTurnId] = useState(''); const [turnStatus, setTurnStatus] = useState(''); const [question, setQuestion] = useState<Data | null>(null);
  const [answer, setAnswer] = useState(''); const [choices, setChoices] = useState<string[]>([]); const [calls, setCalls] = useState<Data[]>([]);
  const [events, setEvents] = useState<StreamEvent[]>([]); const [diagnostic, setDiagnostic] = useState<any>(null); const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [actionBusy, setActionBusy] = useState(false);
  const controller = useRef<AbortController | null>(null); const generation = useRef(0); const cursor = useRef('');
  const currentAssistant = useRef(''); const ended = useRef(false); const lastRequest = useRef<{ agentId: string; body: Data } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  async function loadConversations() { if (!config.apiConfigured) return; const result = await api('conversations'); setConversations(result.data.conversations || []); }
  useEffect(() => { if (!agentId && agents[0]) setAgentId(agents[0].id); }, [agents, agentId]);
  useEffect(() => { loadConversations().catch(setError); return () => { generation.current++; controller.current?.abort(); }; }, [config.apiConfigured]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages, question]);
  async function loadCalls(id = conversationId) { if (!id) return; const result = await api('tool-calls', { conversationId: id, pending: 'true' }); setCalls(result.data.items || []); }
  useEffect(() => { if (!conversationId || !busy) return; const timer = setInterval(() => loadCalls().catch(() => {}), 5000); return () => clearInterval(timer); }, [conversationId, busy]);
  function newConversation() { generation.current++; controller.current?.abort(); setBusy(false); setConversationId(''); setTurnId(''); setTurnStatus(''); setMessages([]); setQuestion(null); setChoices([]); setAnswer(''); setCalls([]); setEvents([]); setError(null); setMore(false); cursor.current = ''; lastRequest.current = null; }
  function receipt(data: Data) {
    const conv = data.conversation_id || data.turn?.conversation_id; const tid = data.turn_id || data.turn?.id;
    if (conv) { setConversationId(conv); setRefs({ conversationId: conv }); }
    if (tid) { setTurnId(tid); setRefs({ turnId: tid }); }
    setTurnStatus(data.status || data.turn?.status || 'running');
    if (data.question) { setQuestion(normalizeQuestion(data.question)); setChoices([]); setAnswer(''); }
  }
  function handleEvent(event: StreamEvent) {
    if (event.id !== undefined) cursor.current = event.id;
    setEvents(old => [...old, event].slice(-150));
    if (event.event === 'accepted') receipt(event.data);
    if (event.event === 'text') setMessages(old => old.map(item => item.id === currentAssistant.current ? { ...item, text: item.text + (event.data.delta || '') } : item));
    if (event.event === 'turn_end') { ended.current = true; setTurnStatus(event.data.status || 'done'); setQuestion(normalizeQuestion(event.data.question) || null); setChoices([]); setAnswer(''); if (event.data.error) setError(new Error(event.data.error)); }
  }
  async function observe(id: string, resume = false, newReply = false) {
    controller.current?.abort(); const ticket = ++generation.current;
    controller.current = new AbortController(); setBusy(true); setError(null); ended.current = false;
    if (!resume) { cursor.current = ''; if (newReply || !currentAssistant.current) currentAssistant.current = uuid(); const replyId = currentAssistant.current; setMessages(old => old.some(item => item.id === replyId) ? old.map(item => item.id === replyId ? { ...item, text: '' } : item) : [...old, { id: replyId, role: 'assistant', text: '' }]); }
    try {
      await api('stream', { turnId: id, ...(cursor.current ? { since: cursor.current } : {}) }, undefined, { signal: controller.current.signal, onEvent: event => { if (generation.current === ticket) handleEvent(event); } });
      if (!ended.current && generation.current === ticket) setTurnStatus('观察中断，可续传');
      await loadConversations();
    } catch (e) { if ((e as Error).name !== 'AbortError' && generation.current === ticket) { setError(e); setTurnStatus('观察中断，可续传'); } }
    finally { if (generation.current === ticket) setBusy(false); }
  }
  async function send(event?: React.FormEvent, retry = false) {
    event?.preventDefault(); if (!config.apiConfigured) { configure(); return; } if (!agentId || (!message.trim() && !retry)) return;
    const request = retry ? lastRequest.current : { agentId, body: { message: message.trim(), client_request_id: uuid(), ...(conversationId ? { conversation_id: conversationId } : {}), effort, stream: mode === 'stream', async: mode === 'async' } };
    if (!request) return;
    lastRequest.current = request; controller.current?.abort(); controller.current = new AbortController(); const ticket = ++generation.current;
    setBusy(true); setError(null); setQuestion(null); setEvents([]); setTurnStatus('正在提交'); ended.current = false; cursor.current = '';
    if (!retry) { currentAssistant.current = uuid(); setMessages(old => [...old, { id: uuid(), role: 'user', text: request.body.message }, { id: currentAssistant.current, role: 'assistant', text: '' }]); setMessage(''); }
    else setMessages(old => old.map(item => item.id === currentAssistant.current ? { ...item, text: '' } : item));
    try {
      const result = await api('chat', { agentId: request.agentId }, request.body, { signal: controller.current.signal, onEvent: event => { if (generation.current === ticket) handleEvent(event); } });
      if (generation.current !== ticket) return;
      if (!request.body.stream) {
        receipt(result.data); const text = result.data.text || messageText(result.data.content);
        setMessages(old => old.map(item => item.id === currentAssistant.current ? { ...item, text, content: result.data.content } : item));
        if (result.status === 202) notify('请求已接受，可点击「订阅进度」继续观察');
      } else if (!ended.current) { setTurnStatus('观察中断，可续传'); setError(new Error('流连接已结束，但尚未收到 turn_end。可断点续传，或使用原请求编号重试。')); }
      await loadConversations(); if (ended.current || !request.body.stream) lastRequest.current = null;
    } catch (e) { if (generation.current === ticket && (e as Error).name !== 'AbortError') setError(e); }
    finally { if (generation.current === ticket) setBusy(false); }
  }
  async function openConversation(item: Data) {
    generation.current++; controller.current?.abort(); setBusy(false); setError(null); setConversationId(item.id); setAgentId(item.agent_id || agentId); setTurnId(''); setTurnStatus(''); setMessages([]); setQuestion(null); setCalls([]); cursor.current = ''; setRefs({ conversationId: item.id, agentId: item.agent_id || agentId });
    try {
      const result = await api('messages', { conversationId: item.id }); setMessages(result.data.messages.map((message: Data) => ({ id: message.id, role: message.role, text: messageText(message.content), content: message.content }))); setMore(result.data.has_more);
      const pending = await api('pending-question', { conversationId: item.id }); setQuestion(normalizeQuestion(pending.data.question));
      setChoices([]); setAnswer(''); await loadCalls(item.id);
    } catch (e) { setError(e); }
  }
  async function answerQuestion(event: React.FormEvent) {
    event.preventDefault(); if (!question || !conversationId) return; setActionBusy(true); setError(null);
    try { const result = await api('answer', { conversationId }, { question_id: question.id, selected: choices, free_text: answer }); setQuestion(null); setMessages(old => [...old, { id: uuid(), role: 'user', text: [...choices, answer].filter(Boolean).join('；') }]); receipt(result.data); if (result.data.turn_id) void observe(result.data.turn_id, false, true); }
    catch (e) { setError(e); } finally { setActionBusy(false); }
  }
  async function decide(id: string, allow: boolean) { setActionBusy(true); setError(null); try { await api('tool-decision', { toolCallId: id }, { allow }); await loadCalls(); notify(allow ? '已允许本次工具调用' : '已拒绝本次工具调用'); } catch (e) { setError(e); } finally { setActionBusy(false); } }
  async function inspect(id: string) { if (!turnId) return; setError(null); try { const result = await api(id, { turnId }); setDiagnostic(result.data); if (id === 'turn') { receipt(result.data); if (result.data.text) setMessages(old => old.map(item => item.id === currentAssistant.current ? { ...item, text: result.data.text, content: result.data.content } : item)); } setShowDiagnostic(true); } catch (e) { setError(e); } }
  const activeAgent = agents.find(a => a.id === agentId);
  return <>
    <PageHeading title="助理对话"><Button onClick={newConversation}><Plus size={15} />新建会话</Button><Button onClick={() => navigate('explorer', 'chat')}><Code2 size={15} />查看 API</Button></PageHeading>
    <div className="chat-layout"><aside className="panel conversation-panel"><div className="panel-heading"><h3>项目会话</h3><button className="icon-button" aria-label="刷新会话" onClick={() => loadConversations().catch(setError)}><RefreshCw size={15} /></button></div>{conversations.length ? <div className="conversation-list">{conversations.map(item => <button key={item.id} className={conversationId === item.id ? 'active' : ''} onClick={() => openConversation(item)}><span className="conversation-icon"><MessageSquare size={16} /></span><span><strong>{item.title || '未命名会话'}</strong><small>{item.agent_name || '助理'} · {item.message_count || 0} 条消息</small></span></button>)}</div> : <div className="small-empty">暂无会话</div>}</aside><section className="panel chat-panel"><div className="chat-header"><span className="assistant-avatar"><Bot size={22} /></span><div><select aria-label="选择助理" value={agentId} disabled={!!conversationId || busy} onChange={e => { setAgentId(e.target.value); setRefs({ agentId: e.target.value }); }}>{!agents.length && <option value="">配置后选择项目助理</option>}{agents.map(agent => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select><span>{activeAgent?.role || '选择项目助理'}</span></div><Badge tone={busy ? 'green' : ''}>{busy ? '正在执行' : turnStatus || '准备就绪'}</Badge></div>
    <div className="chat-messages">{more && <Button kind="ghost" onClick={async () => { try { const result = await api('messages', { conversationId, before_id: messages[0].id }); setMessages(old => [...result.data.messages.map((m: Data) => ({ id: m.id, role: m.role, text: messageText(m.content), content: m.content })), ...old]); setMore(result.data.has_more); } catch (e) { setError(e); } }}>加载更早消息</Button>}{!messages.length && <div className="chat-welcome"><p>{config.apiConfigured ? '选择助理，输入消息。' : '配置项目 Key 后选择助理。'}</p>{!config.apiConfigured && <Button kind="primary" onClick={configure}>连接配置</Button>}</div>}{messages.map(item => <article className={`chat-message ${item.role}`} key={item.id}><span className="message-avatar">{item.role === 'user' ? '你' : <Bot size={17} />}</span><div className="message-body">{item.role !== 'user' && <span className="message-author">{activeAgent?.name || '助理'}</span>}<div className="message-text">{item.text || (busy && item.id === currentAssistant.current ? <span className="typing-dots">正在思考<span>…</span></span> : '无文本内容')}</div>{item.content && <details className="message-content"><summary>查看平台内容与产物</summary><Code value={item.content} /></details>}</div></article>)}
    {question && <form className="question-card" onSubmit={answerQuestion}><div className="eyebrow">{question.header || '待回答问题'}</div><h3>{question.question}</h3><div className="question-options">{(question.options || []).map((option: Data) => <label className={choices.includes(option.label) ? 'selected' : ''} key={option.label}><input type={question.multi_select ? 'checkbox' : 'radio'} name="question-option" checked={choices.includes(option.label)} onChange={e => setChoices(old => question.multi_select ? e.target.checked ? [...old, option.label] : old.filter(value => value !== option.label) : [option.label])} /><span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span></label>)}</div><input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="输入回答…" aria-label="回答助理问题" /><Button type="submit" kind="primary" disabled={!choices.length && !answer.trim()} loading={actionBusy}>提交回答并继续<ArrowRight size={14} /></Button></form>}
    {calls.map(call => <div className="tool-card" key={call.id}><div><Wrench size={17} /><h3>{call.tool_name || '工具调用授权'}</h3><Badge>{call.state}</Badge></div><Code value={call} /><div><Button disabled={actionBusy} onClick={() => decide(call.id, false)}>拒绝本次调用</Button><Button disabled={actionBusy} kind="primary" onClick={() => decide(call.id, true)}>允许本次调用</Button></div></div>)}<div ref={bottom} /></div>
    <div className="chat-controls"><ErrorBox error={error} />{!!error && lastRequest.current && <Button kind="ghost" disabled={busy} onClick={() => send(undefined, true)}>用原请求编号重试</Button>}{turnId && <div className="turn-toolbar"><code title={turnId}>轮次 {turnId.slice(0, 8)}</code><button className="text-link" disabled={busy} onClick={() => observe(turnId, !!cursor.current)}><Radio size={13} />{cursor.current ? '断点续传' : '订阅进度'}</button><button className="text-link" onClick={() => inspect('turn')}>查询状态</button><button className="text-link" onClick={() => inspect('vm-jobs')}>VM 子任务</button><button className="text-link danger-text" disabled={actionBusy} onClick={async () => { setActionBusy(true); try { await api('cancel', { turnId }); notify('已发送停止请求，正在确认执行状态'); await inspect('turn'); } catch (e) { setError(e); } finally { setActionBusy(false); } }}><Square size={12} />停止执行</button></div>}{showDiagnostic && <div className="chat-diagnostic"><button className="icon-button" aria-label="关闭执行详情" onClick={() => setShowDiagnostic(false)}><X size={14} /></button><Code value={diagnostic} /></div>}
    <form className="chat-composer" onSubmit={send}><textarea aria-label="对话消息" value={message} onChange={e => setMessage(e.target.value)} placeholder="输入消息…" rows={3} disabled={busy} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) void send(); } }} /><div className="composer-bottom"><div><select aria-label="响应模式" value={mode} onChange={e => setMode(e.target.value)} disabled={busy}><option value="stream">SSE 实时流</option><option value="async">异步回执</option><option value="sync">同步响应</option></select><select aria-label="思考档位" value={effort} onChange={e => setEffort(e.target.value)} disabled={busy}>{['low', 'medium', 'high', 'xhigh', 'max'].map(e => <option key={e} value={e}>{e}</option>)}</select></div><Button kind="primary" type="submit" loading={busy} disabled={!message.trim() || !agentId}><Send size={15} />发送</Button></div></form><div className="composer-note">Enter 发送 · Shift + Enter 换行 · 执行消耗计入项目拥有者</div>
    {conversationId && <details className="chat-advanced"><summary>会话恢复与诊断</summary><div className="toolbar"><Button kind="ghost" onClick={async () => { try { const result = await api('pending-question', { conversationId }); setQuestion(normalizeQuestion(result.data.question)); if (!result.data.question) notify('当前没有待回答问题'); } catch (e) { setError(e); } }}>恢复待答问题</Button><Button kind="ghost" onClick={() => loadCalls().catch(setError)}>刷新工具授权</Button><Button kind="ghost" onClick={() => { setRefs({ conversationId }); navigate('explorer', 'tool-calls'); }}>全部授权记录</Button></div><Field label="执行轮次 ID（用于恢复已知轮次）"><input value={turnId} onChange={e => { setTurnId(e.target.value); cursor.current = ''; currentAssistant.current = ''; }} placeholder="粘贴 turn_id" /></Field><small className="mono">会话 {conversationId}</small></details>}{events.length > 0 && <details className="chat-events"><summary><Radio size={13} />执行事件 · {events.length} <span>最后游标 {cursor.current || '—'}</span></summary><div className="event-list">{events.map((event, index) => <div key={index}><Badge>{event.event}</Badge><code>{pretty(event.data)}</code></div>)}</div></details>}</div></section></div>
  </>;
}
