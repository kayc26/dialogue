// The chat shows the tester's allowance as a percentage, never in dollars (ADR-0014), and
// its model calls carry a fresh sign-in token to the proxy instead of an OpenRouter key.

import { describe, expect, it } from 'vitest'
import { allowanceText, fetchAllowance } from './client'
import { completeChat, OpenRouterError } from '../openrouter'
import { corsHeaders, proxyConfig } from './policy'

describe('the allowance line', () => {
  it('shows a percentage, never dollars', () => {
    const text = allowanceText({ used: 0.257, cap: 1, percent: 25 })
    expect(text).toBe("You've used 25% of your test allowance")
    expect(text).not.toMatch(/\$|0\.257/)
  })
  it('says when it is all used, and when the role is not capped', () => {
    expect(allowanceText({ used: 1.01, cap: 1, percent: 100 })).toBe("You've used all of your test allowance")
    expect(allowanceText({ used: 3.5, cap: null, percent: null })).toBe('Test allowance: not capped (admin)')
  })
  it('is left out when the proxy cannot be reached, rather than breaking the chat', async () => {
    const down = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch
    expect(await fetchAllowance('https://fn.example.com', async () => 'jwt', down)).toBeNull()
    expect(allowanceText(null)).toBe('')
  })
})

describe('model calls through the proxy', () => {
  it('go to the proxy URL with a fresh sign-in token, not an OpenRouter key', async () => {
    const seen: { url: string; auth: string | null }[] = []
    let n = 0
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: new Headers(init.headers).get('authorization') })
      const sse = 'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
      return new Response(sse, { headers: { 'content-type': 'text/event-stream' } })
    }) as unknown as typeof fetch
    const token = async () => `jwt-${++n}`
    for (let i = 0; i < 2; i++) {
      await completeChat({ apiKey: token, baseUrl: 'https://fn.example.com', model: 'm', messages: [{ role: 'user', content: 'hi' }], fetchImpl: fake })
    }
    expect(seen).toEqual([
      { url: 'https://fn.example.com/chat/completions', auth: 'Bearer jwt-1' },
      { url: 'https://fn.example.com/chat/completions', auth: 'Bearer jwt-2' },
    ])
  })
  describe('Regression tests', () => {
    it("the proxy allows every header the chat's model calls send (live failure, 2026-11-16)", async () => {
      // Bug: completeChat sends X-Title, but the proxy's CORS preflight allowed only
      // authorization and content-type. Browsers check the preflight first and sent
      // nothing, so every answer failed with "Failed to fetch" in ~45 ms and nothing was
      // spent. curl skips the preflight, so the smoke tests passed. Fixed: x-title is
      // allowed; this test compares the headers the chat really sends with the allow-list.
      let sent: string[] = []
      const fake = (async (_url: string, init: RequestInit) => {
        sent = [...new Headers(init.headers).keys()]
        return new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
      }) as unknown as typeof fetch
      await completeChat({ apiKey: async () => 'jwt', baseUrl: 'https://fn.example.com', model: 'm', messages: [], fetchImpl: fake })
      const allowed = corsHeaders('https://kayc26.github.io', proxyConfig({}))['Access-Control-Allow-Headers'].split(/,\s*/)
      expect(sent.length).toBeGreaterThan(0)
      for (const h of sent) expect(allowed, h).toContain(h.toLowerCase())
    })
  })

  it('a used-up allowance comes back as a 402 the chat can name', async () => {
    const fake = (async () => Response.json({ error: { message: 'allowance_used' } }, { status: 402 })) as unknown as typeof fetch
    const err = await completeChat({ apiKey: async () => 'jwt', baseUrl: 'https://fn.example.com', model: 'm', messages: [], fetchImpl: fake }).catch((e) => e)
    expect(err).toBeInstanceOf(OpenRouterError)
    expect(err).toMatchObject({ status: 402, message: "You've used your test allowance (402)." })
  })
})
