import { byId, resolveEndpoint } from '../../shared/catalog';
import { SSEParser, type StreamEvent } from './sse';
export type Data = Record<string, any>;
export type ApiResult = { data: any; status: number; headers: Record<string, string>; duration: number };
export type RequestRecord = { id: string; endpoint: string; method: string; path: string; started: string; duration: number; status: number; data: any; request: any; headers: Record<string, string> };
let records: RequestRecord[] = [];
const listeners = new Set<() => void>();
export const history = { subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, get: () => records, clear() { records = []; listeners.forEach(fn => fn()); } };
export class ApiError extends Error {
  constructor(public result: ApiResult) { super(result.data?.error?.message || `请求失败（HTTP ${result.status}）`); }
}
export function uuid() { return globalThis.crypto?.randomUUID?.() || '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16)); }
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function api(id: string, values: Record<string, string> = {}, body?: any, options: { signal?: AbortSignal; onEvent?: (event: StreamEvent) => void; downloadName?: string } = {}): Promise<ApiResult> {
  const endpoint = byId[id];
  if (!endpoint) throw new Error('未知接口');
  const path = resolveEndpoint(endpoint, values);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== '') query.set(key, value);
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof FormData || body instanceof Blob) payload = body;
  else if (typeof body === 'string') { payload = body; headers['Content-Type'] = 'application/octet-stream'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const start = performance.now();
  let result: ApiResult = { status: 0, data: null, headers: {}, duration: 0 };
  try {
    const response = await fetch(`/gateway/${id}${query.size ? `?${query}` : ''}`, { method: endpoint.method, headers, body: payload, signal: options.signal });
    result.status = response.status; result.headers = Object.fromEntries(response.headers);
    const type = response.headers.get('content-type') || '';
    if (response.ok && type.includes('text/event-stream') && response.body) {
      const events: StreamEvent[] = [];
      const parser = new SSEParser(event => { events.push(event); if (events.length > 250) events.shift(); options.onEvent?.(event); });
      const reader = response.body.getReader();
      try { while (true) { const { done, value } = await reader.read(); if (done) break; parser.feed(value); } parser.finish(); }
      finally { reader.releaseLock(); result.data = { events }; }
    } else if (response.ok && endpoint.output === 'download') {
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      let filename = options.downloadName || values.path?.split('/').pop() || 'download';
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      if (!options.downloadName && encoded) { try { filename = decodeURIComponent(encoded); } catch { /* use fallback */ } }
      download(blob, filename);
      result.data = { downloaded: true, filename, size: blob.size, content_type: blob.type };
    } else {
      const text = await response.text();
      if (endpoint.output === 'text' && response.ok) result.data = text;
      else { try { result.data = text ? JSON.parse(text) : null; } catch { result.data = text; } }
    }
    if (!response.ok) throw new ApiError(result);
    return result;
  } catch (error) {
    if (!(error instanceof ApiError)) result.data = { error: { code: options.signal?.aborted ? 'observation_stopped' : 'network_error', message: (error as Error).message } };
    throw error;
  } finally {
    result.duration = Math.round(performance.now() - start);
    records = [{ id: uuid(), endpoint: id, method: endpoint.method, path, started: new Date().toISOString(), ...result, request: body instanceof FormData ? '[multipart/form-data]' : body instanceof Blob ? `[${body.size} bytes]` : body }, ...records].slice(0, 100);
    listeners.forEach(fn => fn());
  }
}
export function pretty(data: unknown) { return typeof data === 'string' ? data : JSON.stringify(data, null, 2) ?? ''; }
export function messageText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(block => block.text || (block.type === 'text' ? block.content : '') || '').join('');
  return content?.text || '';
}
