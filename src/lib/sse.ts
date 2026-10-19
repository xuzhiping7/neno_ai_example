export type StreamEvent = { event: string; id?: string; data: any };
export class SSEParser {
  private buffer = '';
  private data: string[] = [];
  private event = '';
  private id: string | undefined;
  private decoder = new TextDecoder();
  constructor(private emit: (event: StreamEvent) => void) {}
  feed(bytes: Uint8Array) { this.buffer += this.decoder.decode(bytes, { stream: true }); this.lines(false); }
  finish() { this.buffer += this.decoder.decode(); this.lines(true); }
  private lines(final: boolean) {
    while (true) {
      const match = /[\r\n]/.exec(this.buffer);
      if (!match) break;
      const index = match.index;
      if (!final && this.buffer[index] === '\r' && index === this.buffer.length - 1) break;
      const line = this.buffer.slice(0, index);
      const length = this.buffer[index] === '\r' && this.buffer[index + 1] === '\n' ? 2 : 1;
      this.buffer = this.buffer.slice(index + length);
      this.line(line);
    }
    // An unterminated event at EOF is not a confirmed event and must not advance the resume cursor.
  }
  private line(line: string) {
    if (!line) {
      if (this.data.length) {
        const text = this.data.join('\n');
        let data: unknown = text; try { data = JSON.parse(text); } catch { /* text events are valid */ }
        this.emit({ event: this.event || 'message', id: this.id, data });
      }
      this.data = []; this.event = ''; this.id = undefined; return;
    }
    if (line.startsWith(':')) return;
    const index = line.indexOf(':');
    const field = index === -1 ? line : line.slice(0, index);
    let value = index === -1 ? '' : line.slice(index + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') this.data.push(value);
    if (field === 'event') this.event = value;
    if (field === 'id' && !value.includes('\0')) this.id = value;
  }
}
