import { describe, expect, it } from 'vitest'
import { SSEParser } from './sse'

// Feeds `text` to a parser in the given chunk sizes, the way a slow network would.
function feed(text: string, chunkSizes: number[]): string[] {
  const p = new SSEParser()
  const out: string[] = []
  let i = 0
  let k = 0
  while (i < text.length) {
    const n = chunkSizes[k++ % chunkSizes.length]!
    out.push(...p.push(text.slice(i, i + n)))
    i += n
  }
  out.push(...p.flush())
  return out
}

const STREAM =
  ': OPENROUTER PROCESSING\n\n' +
  'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
  'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
  'data: [DONE]\n\n'

describe('SSEParser', () => {
  it('yields the same events whether the stream arrives whole or one byte at a time', () => {
    const whole = feed(STREAM, [STREAM.length])
    expect(whole).toEqual(['{"choices":[{"delta":{"content":"Hel"}}]}', '{"choices":[{"delta":{"content":"lo"}}]}', '[DONE]'])
    for (const sizes of [[1], [2], [3, 7], [13, 1, 5]]) expect(feed(STREAM, sizes)).toEqual(whole)
  })

  it('ignores OpenRouter keep-alive comments', () => {
    expect(feed(': OPENROUTER PROCESSING\n\n: still here\n\n', [5])).toEqual([])
  })

  it('handles CRLF line endings, including a \\r and \\n split across chunks', () => {
    const crlf = 'data: {"a":1}\r\n\r\ndata: {"b":2}\r\n\r\n'
    const splitAtCR = crlf.indexOf('\r') + 1 // chunk boundary right between \r and \n
    expect(feed(crlf, [splitAtCR, 100])).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('emits a final event even if the stream ends without a trailing blank line', () => {
    expect(feed('data: {"last":true}', [4])).toEqual(['{"last":true}'])
  })

  it('joins multi-line data fields with newlines, per the SSE spec', () => {
    expect(feed('data: line one\ndata: line two\n\n', [100])).toEqual(['line one\nline two'])
  })
})
