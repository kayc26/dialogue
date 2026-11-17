// Read what a completion cost from OpenRouter's response, so the proxy can count each
// tester's spending (ADR-0014, C). With `usage: { include: true }`, a streamed response
// ends with a chunk carrying `usage.cost` (dollars); a non-streamed one has it in the
// JSON body. Network chunks split anywhere, so streamed text goes through the same
// SSE parser the client uses.

import { SSEParser } from '../sse'

export class StreamCost {
  private parser = new SSEParser()
  cost = 0
  tokens = 0

  push(text: string): void {
    for (const p of this.parser.push(text)) this.read(p)
  }

  flush(): void {
    for (const p of this.parser.flush()) this.read(p)
  }

  private read(payload: string): void {
    if (payload === '[DONE]') return
    try {
      const j = JSON.parse(payload) as { usage?: { cost?: number; completion_tokens?: number } }
      if (typeof j.usage?.cost === 'number') this.cost = j.usage.cost
      if (typeof j.usage?.completion_tokens === 'number') this.tokens = j.usage.completion_tokens
    } catch {
      // keep-alive comments and partial junk carry no usage
    }
  }
}

export function costOfJson(body: unknown): { cost: number; tokens: number } {
  const u = (body as { usage?: { cost?: number; completion_tokens?: number } })?.usage
  return { cost: typeof u?.cost === 'number' ? u.cost : 0, tokens: typeof u?.completion_tokens === 'number' ? u.completion_tokens : 0 }
}
