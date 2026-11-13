// Incremental parser for server-sent events (`text/event-stream`), the format
// OpenRouter streams completions in.
//
// Network chunks can split ANYWHERE — mid-line, mid-JSON, even between a \r and
// its \n — so this buffers until it has complete lines and emits one payload per
// complete event. A parser that assumes chunk == line works on a fast local
// connection and silently drops tokens on a slow one (CLAUDE.md, Fifth Directive).

export class SSEParser {
  private buffer = ''
  private dataLines: string[] = []

  /** Feed a decoded chunk; returns the `data` payloads of every event it completed. */
  push(chunk: string): string[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    const out: string[] = []
    for (const line of lines) this.processLine(stripCR(line), out)
    return out
  }

  /** Call when the stream ends: emits an event left unterminated by a final blank line. */
  flush(): string[] {
    const out: string[] = []
    if (this.buffer) {
      this.processLine(stripCR(this.buffer), out)
      this.buffer = ''
    }
    this.dispatch(out)
    return out
  }

  private processLine(line: string, out: string[]): void {
    if (line === '') {
      this.dispatch(out)
      return
    }
    // Lines starting with ':' are comments; OpenRouter sends ": OPENROUTER PROCESSING" keep-alives.
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') this.dataLines.push(value)
    // Other fields (event, id, retry) are not used by OpenRouter's chat stream.
  }

  private dispatch(out: string[]): void {
    if (this.dataLines.length === 0) return
    out.push(this.dataLines.join('\n'))
    this.dataLines = []
  }
}

function stripCR(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line
}
