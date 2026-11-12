<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0003: V1 scope — what makes it a harness and not just a chat box

- **Date**: 2026-11-12
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: "Harness" can mean a chat client, an instrument for inspecting models, or an agent loop with tools. Pick which one v1 is, because that decides the features, the stored data, and how big the UI gets.

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-12): "i want to build a simple harness: a chat page interface online".

**Agency Grant**: Recommend; Kay decides.

---

## Explicitation

**What I understand**:

1. **The word "harness" is the underspecified part.** Every option below includes a chat page. What differs is whether the user is *chatting* with a model, *inspecting* it (parameters, raw requests, token use and cost), or *letting it act* (tool calls in a loop).
2. **`localStorage` has a hard ceiling.** Browsers allow roughly 5 MB per origin, shared with every other Pages project on `kayc26.github.io` (ADR-0001). Text-only chat history fits for a long time. Pasted documents, images, or raw request/response logs fill it much faster. So scope and storage are coupled.

**Assumptions**:

- Common to every option: streaming replies, a model picker fed by OpenRouter's `/api/v1/models` (CORS-open, verified 2026-11-12), and Markdown rendering (sanitized, per ADR-0001).
- No accounts, no sync between devices. Each browser keeps its own history.

**Confirm**: Kay. Is this for a course (CIS7000)? If so, does the assignment define what "harness" should mean?

---

## Questions

### QST-V1-SCOPE: What should the first version of Harness do?
- Status: unanswered
- Why asking: Kay asked for "a simple harness: a chat page interface." Every reading includes a chat page with a model picker and streamed replies. But "harness" can mean a plain chat client, an instrument for inspecting what the model does, or an agent loop where the model calls tools. That decides the features, what gets saved in `localStorage` (about 5 MB, shared with other Pages projects on the account), and how much UI ADR-0002's stack must carry.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Chat client**: Multiple saved conversations in a sidebar, a model picker, streamed replies, Markdown rendering, an optional system prompt per conversation, and export/import of history as JSON. A minimal personal chat app using your own key.
- **B — Chat client + inspector**: A, plus controls and visibility for studying model behavior: temperature and max-tokens settings, token usage and cost shown on each reply (from the usage data OpenRouter returns), and a raw view of each request and response. Answers "what exactly did I send, and what did it cost?"
- **C — Chat client + agent loop**: A, plus tool calling. The page offers a few tools that run in the browser (for example a calculator, a fetch tool, or a notes store); the model can call them, and the page runs each call and feeds the result back. "Harness" in the agent-harness sense. Clearly the most work, and tool support varies by model.
- **D — Bare minimum**: One conversation, one model, plain-text replies, a "clear" button. Smallest possible thing that works, for when the point is the deployment pattern, not the UI.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-12)

**B — Chat client + inspector.** *Rationale*: "Harness" more often means an instrument than just a client, and B's additions are cheap given what OpenRouter already returns (usage data comes back with each reply; the request is something we build ourselves). B also leaves a clean path to C later, since tool calls are just more request/response pairs for the inspector to show. *Confidence*: 0.5 — because this is about what Kay means, and the word alone can't settle it. That puts it in the "route to another mind" band, and the other mind is Kay's. *If wrong*: if "harness" means agent harness (tools, loops), flip to **C**. If the point is a working chat page and nothing more, flip to **A**, or to **D** if it's a deployment exercise.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Decision

Pending the answer to QST-V1-SCOPE.

---

## Open Follow-ups

- [ ] Storage budget: show how much of `localStorage` is used and offer export before it fills. If raw logs (B) or tool traces (C) push past the ceiling, revisit with IndexedDB, which is also browser-local but has much larger limits.
- [ ] Version the stored data format from day one (a `schemaVersion` field), so a later change doesn't wipe or corrupt saved history.

---

## Iterations

### Iteration 1 (2026-11-12)
- Trigger: Kay's project prompt
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Initial draft; QST-V1-SCOPE posed with a recommendation
- Outcome: Draft

---

## Links

- Related ADRs: ADR-0001 (shared-origin storage, sanitized rendering), ADR-0002 (stack must carry this scope's UI)
