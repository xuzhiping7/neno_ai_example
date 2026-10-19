import { Children, Fragment, cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactNode, type ReactElement } from 'react';
import { Check, Copy, LoaderCircle, X, ExternalLink, AlertCircle, ArrowUpRight, Terminal } from 'lucide-react';
import { pretty } from '../lib/api';
export function Button({ children, kind = 'secondary', loading, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }) {
  return <button {...props} disabled={props.disabled || loading} className={`button ${kind} ${className}`}>{loading && <LoaderCircle size={15} className="spin" />}{children}</button>;
}
export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) { return <div className="empty"><span className="empty-icon">{icon || <Terminal size={25} />}</span><h3>{title}</h3><div>{children}</div></div>; }
export function ErrorBox({ error }: { error: unknown }) { return error ? <div className="error-box" role="alert"><AlertCircle size={16} /><span>{error instanceof Error ? error.message : String(error)}</span></div> : null; }
export function CopyButton({ text, label = '复制', className = '' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else { const input = document.createElement('textarea'); input.value = text; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select(); const ok = document.execCommand('copy'); input.remove(); if (!ok) throw new Error(); }
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { setCopied(false); }
  }
  return <button className={`copy-button ${className}`} onClick={copy} aria-label={label}>{copied ? <Check size={14} /> : <Copy size={14} />}<span>{copied ? '已复制' : label}</span></button>;
}
export function Code({ value, title, dark = false }: { value: unknown; title?: string; dark?: boolean }) { const text = pretty(value); return <div className={`code-box ${dark ? 'dark-code' : ''}`}>{title && <div className="code-title"><span>{title}</span><CopyButton text={text} /></div>}<pre><code>{text}</code></pre></div>; }
export function Method({ value }: { value: string }) { return <span className={`method ${value.toLowerCase()}`}>{value}</span>; }
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
export function Field({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  const id = useId();
  function associate(node: ReactNode): ReactNode {
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<any>;
    if (element.type === Fragment) return cloneElement(element, {}, Children.map(element.props.children, associate));
    return cloneElement(element, { id, 'aria-labelledby': `${id}-label`, 'aria-describedby': hint ? `${id}-hint` : undefined });
  }
  return <div className="field"><label id={`${id}-label`} htmlFor={id}>{label}</label>{Children.map(children, associate)}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}
export function DocLink({ url }: { url?: string }) { return url ? <a className="text-link" target="_blank" rel="noreferrer" href={url}>查看接口文档 <ExternalLink size={13} /></a> : null; }
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button></div>{children}</dialog>;
}
export function PageHeading({ title, description, children }: { title: string; description?: string; children?: ReactNode }) { return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children && <div className="heading-actions">{children}</div>}</div>; }
export function SmallLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-link" onClick={onClick}>{children}<ArrowUpRight size={14} /></button>; }
