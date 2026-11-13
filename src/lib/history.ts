// Turns a stored conversation into the message list sent to the model.
//
// Stored history can be "torn": the tab closed while tools were running, or
// an older run was interrupted, leaving an assistant tool call with no result
// after it. Sending that history makes the provider reject the request, and
// the conversation is stuck forever. So every request is repaired first.

import type { ChatMessage, StoredMessage } from './types'

export const INTERRUPTED_RESULT = 'Not executed: the run was interrupted before this tool call completed.'

export function buildRequestMessages(systemPrompt: string, stored: StoredMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  if (systemPrompt.trim()) out.push({ role: 'system', content: systemPrompt })
  for (const m of stored) {
    if (m.error || m.notice) continue // shown to the user, never replayed to the model
    const msg: ChatMessage = { role: m.role, content: m.content }
    if (m.tool_calls?.length) msg.tool_calls = m.tool_calls
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
    out.push(msg)
  }
  return repairToolPairs(out)
}

/** Ensures each assistant tool call is answered by a tool message, and drops tool messages that answer nothing. */
export function repairToolPairs(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  let open: string[] = [] // ids of the most recent assistant turn still awaiting results

  const closeOpen = () => {
    for (const id of open) out.push({ role: 'tool', tool_call_id: id, content: INTERRUPTED_RESULT })
    open = []
  }

  for (const m of messages) {
    if (m.role === 'tool') {
      const idx = m.tool_call_id ? open.indexOf(m.tool_call_id) : -1
      if (idx === -1) continue // orphan: no pending call with this id
      open.splice(idx, 1)
      out.push(m)
      continue
    }
    closeOpen()
    out.push(m)
    if (m.role === 'assistant' && m.tool_calls?.length) open = m.tool_calls.map((c) => c.id)
  }
  closeOpen()
  return out
}
