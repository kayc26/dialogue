<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0014: Shared OpenRouter account with a $1 cap per tester

- **Date**: 2026-11-16
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Kay wants testers on the shared OpenRouter account, capped at $1 each, with the chat showing a percentage of the allowance used instead of dollars. A static site can't hold a shared key secretly, so the question is how to share the account safely. Recommendation: one $1-limited key per tester, made from the shared account and stored with the tester's sign-in, so testers paste nothing.

---

## Originating Context

**Source**: Kay, 2026-11-16, in conversation: "can you get rid of the dollar amount in UI, set $1 max for each tester, and show a percentage instead", then "we will use the shared openrouter key in the current local env if that's possible".

**Agency Grant**: Explore the options and recommend; the UI change waits on the choice, because the percentage comes from wherever the cap is enforced.

---

## Explicitation

**What I understand**:

1. **Kay wants three things.** Testers shouldn't need their own OpenRouter account or key. Each tester stops at $1. The chat shows "you've used N% of your allowance", not dollars.
2. **A key in the browser is a public key.** The site is static (GitHub Pages) with no server of our own (ADR-0001, ADR-0010). Anything built into the site, including a key from `.env.local`, can be read by anyone who opens the page's JavaScript. A $1 cap enforced in the browser can be bypassed by anyone holding that key. ADR-0001 rules this out ("never in the repo or the build"), and `.gitignore` says why.
3. **The cap must live outside the browser.** Either OpenRouter enforces it (a credit limit on each key, ADR-0012's first spending guard) or a server of ours does.

**Assumptions**:

- Testers sign in through Neon Auth and are members (ADR-0010, ADR-0011); a handful of people, not the public.
- OpenRouter lets the account owner create keys with a credit limit, and a key can read its own usage and limit (`GET /api/v1/key`). That's what the percentage would come from in A and B.

**Confirm**: Kay (the question below).

---

## Questions

### QST-KEY-SHARING: How do testers use the shared OpenRouter account, each capped at $1?
- Status: unanswered
- Why asking: Kay asked to use "the shared openrouter key in the current local env if that's possible". It's possible to share the *account*. Sharing the *key* through the website isn't safe: the site has no server, so any key it uses is visible to anyone who opens it, and a $1 cap kept in the browser can be bypassed. Each option below gives every tester a $1 limit and lets the chat show a percentage instead of dollars.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — A $1 key per tester, pasted once**: Kay creates one key per tester on the shared account (OpenRouter keys page, credit limit $1) and sends it to them. They paste it once, as now. OpenRouter enforces the $1, and the chat reads that key's usage to show the percentage. No server; almost no code beyond the percentage.
- **B — A $1 key per tester, stored with their account**: same keys as A, but Kay stores each against the tester's sign-in with a small admin script. The app fetches it after sign-in, and only that tester can read it (database access rules, as for their own sessions). Testers paste nothing. OpenRouter still enforces the $1, and the percentage works as in A.
- **C — The shared key behind a small server function**: the shared key stays on a server function (for example a Neon Function), never in the browser. The function checks the tester's sign-in, records each tester's spending in the database, refuses past $1, and forwards the request to OpenRouter. One key for everyone, and the cap is ours. It is a new deployed piece, though, and it has to pass streamed replies through.
- **D — The shared key built into the site**: the simplest to build, and not safe. The key is public, the $1 cap can only be enforced in the browser and is bypassed by anyone who copies the key, and a leaked key is easy to find and drain. It also breaks ADR-0001.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**B — a $1 key per tester, stored with their account.** *Rationale*: B gives Kay's three wants with no server. Testers do nothing; it's all one shared account; OpenRouter enforces the $1, so no tester can get around it, even by copying their key; and the percentage comes straight from OpenRouter's own count for that key. It reuses what exists: sign-in, members, and access rules (ADR-0011). Kay's step is creating one key per tester, a minute each for a handful of testers. C is the right shape if there were dozens of testers, but it adds a server this project has avoided (ADR-0010). D is ruled out above. *Confidence*: 0.75 — because I haven't confirmed in this project that OpenRouter's per-key limit and its `GET /api/v1/key` usage reading work as documented. That's the first check before building. *If wrong*: if per-key limits or the usage reading aren't available, or creating keys by hand is too much, choose **C**.

**ANS:** (by Kay)
[Fill this in]

---

## Decision

Pending QST-KEY-SHARING. Whatever is chosen, the chat stops showing dollars and shows the percentage of the tester's $1 allowance used.

---

## Action Items

- [ ] Kay answers QST-KEY-SHARING. Owner: Kay
- [ ] Check that a $1-limited key reports its usage and limit (`GET /api/v1/key`) before building on it. Owner: Nibble
- [ ] Replace the dollar amount in the chat with "N% of your allowance used". Owner: Nibble

---

## Iterations

### Iteration 1 (2026-11-16)
- Trigger: Kay asked for a $1 cap per tester with a percentage instead of dollars, using the shared key.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Options A–D written up; recommendation B.
- Outcome: Draft (one question open)

---

## Links

- Related ADRs: [ADR-0001](0001-api-key-handling-how-the-openrouter-key-gets-in-and-where-it-lives.md) (the key never goes in the build), [ADR-0010](0010-diabetes-education-bot-how-test-users-reach-it.md) (no server of our own; capped keys per tester), [ADR-0011](0011-database-schema-and-access-rules.md) (access rules), [ADR-0012](0012-model-choice-under-a-15-dollar-openrouter-budget.md) (the $15 budget; per-key limits as the first spending guard)
- Related code: `src/app/ChatPanel.vue` (the key form and the "this chat has used about $…" line), `src/lib/chat/models.ts` (the cost meter)
