import test from 'node:test';
import assert from 'node:assert/strict';
import { SSEParser, type StreamEvent } from '../src/lib/sse';

test('SSE preserves split UTF-8, CRLF, multiline data and non-contiguous cursors', () => {
  const events: StreamEvent[] = [];
  const parser = new SSEParser(event => events.push(event));
  const bytes = new TextEncoder().encode(': keepalive\r\nevent: accepted\r\ndata: {"turn_id":"t1"}\r\n\r\nid: 7\r\nevent: text\r\ndata: {"delta":"你好，小能"}\r\n\r\nid: 19\nevent: note\ndata: line one\ndata: line two\n\nevent: turn_end\ndata: {"status":"done","question":{"id":"q1"}}\n\n');
  for (let offset = 0; offset < bytes.length; offset += 1) parser.feed(bytes.slice(offset, offset + 1));
  parser.finish();
  assert.equal(events.length, 4);
  assert.equal(events[1].data.delta, '你好，小能');
  assert.equal(events[1].id, '7');
  assert.equal(events[2].id, '19');
  assert.equal(events[2].data, 'line one\nline two');
  assert.equal(events[3].data.question.id, 'q1');
});
test('An incomplete event is not acknowledged on connection loss', () => {
  const events: StreamEvent[] = [];
  const parser = new SSEParser(event => events.push(event));
  parser.feed(new TextEncoder().encode('id: 1\nevent: text\ndata: {"delta":"one"}\n\nid: 2\nevent: text\ndata: {"delta":"partial"}'));
  parser.finish();
  assert.deepEqual(events.map(event => event.id), ['1']);
});
