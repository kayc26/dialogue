<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0014: Shared OpenRouter account with a $1 cap per tester

- **Date**: 2026-11-16
- **Iteration**: 5
- **Status**: Implemented
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Kay wants testers on the shared OpenRouter account, capped at $1 each, with the chat showing a percentage of the allowance used instead of dollars. A static site can't hold a shared key secretly, so the question is how to share the account safely. Recommendation (iteration 2): keep the one shared key in a Neon Function inside the existing Neon project, which checks sign-in, tracks each tester's spending in the database, and stops at $1.

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
- Status: answered
- Why asking: Kay asked to use "the shared openrouter key in the current local env if that's possible". It's possible to share the *account*. Sharing the *key* through the website isn't safe: the site has no server, so any key it uses is visible to anyone who opens it, and a $1 cap kept in the browser can be bypassed. Each option below gives every tester a $1 limit and lets the chat show a percentage instead of dollars.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — A $1 key per tester, pasted once**: Kay creates one key per tester on the shared account (OpenRouter keys page, credit limit $1) and sends it to them. They paste it once, as now. OpenRouter enforces the $1, and the chat reads that key's usage to show the percentage. No server; almost no code beyond the percentage.
- **B — A $1 key per tester, stored with their account**: same keys as A, but Kay stores each against the tester's sign-in with a small admin script. The app fetches it after sign-in, and only that tester can read it (database access rules, as for their own sessions). Testers paste nothing. OpenRouter still enforces the $1, and the percentage works as in A.
- **C — The shared key in a Neon Function, in the existing Neon project**: the shared key is set as the function's secret environment variable and never reaches the browser. The function checks the tester's Neon sign-in token (the one the app already uses), records each tester's spending in the existing database, refuses past $1, and forwards the call to OpenRouter, streaming the reply back. The chat shows spending ÷ $1 as the percentage. One shared key, nothing for testers or Kay to set up per person, and no server of our own: Neon hosts the function next to the database, free on this plan for a demo. More to build than A or B: the function, a spending table, and pointing the app's model calls at it.
- **D — The shared key built into the site**: the simplest to build, and not safe. The key is public, the $1 cap can only be enforced in the browser and is bypassed by anyone who copies the key, and a leaked key is easy to find and drain. It also breaks ADR-0001.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16; revised in iteration 2)
**C — the shared key in a Neon Function, in the existing Neon project.** *Rationale*: this is a walk-back from my first recommendation, B, stated openly. B was the best option *without a server*. Kay then asked whether C could run on the existing database instead of a server. The database can't call OpenRouter itself: this Neon project has no `http`, `pg_net`, or `plv8` extension, only `pg_cron` (checked on rls-dev). But Neon Functions run inside the same project. Neon's docs say they:
  - hold secrets as environment variables;
  - can verify the same Neon Auth sign-in token the app already sends to the Data API;
  - can be called from the browser, and stream replies;
  - are on every plan, including Free (1 million invocations and 10 active compute-hours per project).

That matches Kay's actual ask: *one* shared key, with nothing to set up per tester. The $1 cap and the percentage both come from a spending table we control, and the access rules extend to it (ADR-0011). B remains the fallback: less to build, but a key per tester for Kay to create. D is ruled out above.

*Confidence*: 0.7 — because Neon Functions are new to this project (nothing deployed yet), and the deploy step (Neon CLI, secrets) hasn't been tried. *If wrong*: if deploying a function or verifying the sign-in token there doesn't work, choose **B**.

**ANS:** (by Kay, 2026-11-16, in chat)
c

---

## Decision

### Chosen: C — the shared key in a Neon Function, in the existing Neon project (Kay, 2026-11-16)

**How it's built** (commit `a3e9fd6`):
- **Neon Function `llm`** (`functions/llm/index.ts`, declared in `neon.ts`).
  - The shared OpenRouter key is read from `.env.local` when deploying, so it is never in the repo or the site.
  - It verifies the caller's Neon Auth token (Ed25519, WebCrypto) and checks membership.
  - Testers are refused past $1 (`CAP_DOLLARS`). The admin is metered but not capped (`UNCAPPED_ROLES`).
  - Only the assistant's models get through, each at its output cap (ADR-0012).
  - It answers browsers only from the site's origins.
  - It streams OpenRouter's reply through unchanged and records its cost.
- **Logic** in `src/lib/proxy/`, tested offline in the gate.
- **Migration 0004:** `public.llm_spend`, written only by the function; no Data API access.
- **The chat:** no key form and no dollar amount. Model calls go to the proxy with a fresh sign-in token. Below the Ask box it shows "You've used N% of your test allowance"; at 100%, answers turn off and the help button stays.

**Trade-offs accepted**:
- A tester can overshoot $1 by at most one turn's cost: spending is checked before a call and recorded after it.
- The function is a new deployed piece, though Neon hosts it next to the database.

### Consequences
- ADR-0001 still holds: no key in the build. Testers no longer paste a key at all.
- The Harness v1 page (`#/harness`) and `kb:eval-faq` still use an OpenRouter key directly; they are not tester-facing.

---

## Action Items

- [ ] Kay answers QST-KEY-SHARING. Owner: Kay
- [ ] If C: deploy a first Neon Function to rls-dev that verifies the sign-in token, before building the rest. If B: check that a $1-limited key reports its usage and limit (`GET /api/v1/key`). Owner: Nibble
- [ ] Replace the dollar amount in the chat with "N% of your allowance used". Owner: Nibble

---

## Iterations

### Iteration 1 (2026-11-16)
- Trigger: Kay asked for a $1 cap per tester with a percentage instead of dollars, using the shared key.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Options A–D written up; recommendation B.
- Outcome: Draft (one question open)

### Iteration 2 (2026-11-16)
- Trigger: Kay: "can c be used without a server but existing database".
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - Checked: the database can't make web requests (rls-dev has no `http`, `pg_net`, or `plv8`; only `pg_cron`).
  - Neon Functions (same project) can: secrets, sign-in verification, browser calls, streaming, free-plan allowance (Neon docs: runtime limits, authentication, plans).
  - Option C rewritten as a Neon Function. Recommendation walked back from B to C, stated in the Recommendation.
- Outcome: Draft (one question open)

### Iteration 3 (2026-11-16)
- Trigger: Kay answered QST-KEY-SHARING: "c".
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - Decision filled in.
  - Built and tested offline (`a3e9fd6`, 268 tests).
  - Migration 0004 applied to rls-dev.
  - Deploying the function with the Neon CLI was blocked by the session's permission rules. Kay runs the deploy, which is also the step that moves the key from `.env.local` to Neon.
- Outcome: Draft → Accepted (no questions open)

### Iteration 4 (2026-11-16)
- Trigger: Kay: "can you deploy it", then "yes" to production (spending table, function, site push).
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - `neon config plan` caught missing `required` flags in `neon.ts` (fixed, `7eb4635`).
  - Deployed `llm` to rls-dev, then production (`neon deploy --env .env.local --no-env-pull`; each plan showed only "+ function llm").
  - Migration 0004 applied to production.
  - Checked from outside on both branches: the site origin is allowed and others are not; no token and a fake token give 401; a chat call without sign-in gives 401.
  - Site pushed.
  - Not yet verified: a real signed-in call (no tester sign-in available to Nibble). Kay checks on the live site.
- Outcome: Accepted

### Iteration 5 (2026-11-16)
- Trigger: Kay, on the live site: "it says Answers aren't working right now. Help is still available."
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - Found from the turn's logged calls: both failed with "Failed to fetch" in about 45 ms, and nothing was spent. The browser blocked the request at the CORS preflight: `completeChat` sends `X-Title`, and the proxy allowed only `authorization, content-type`.
  - The iteration-4 smoke tests used curl, which skips the preflight, so they passed.
  - Fixed: `x-title` allowed. A regression test compares the headers the chat really sends with the allow-list; it fails without the fix.
  - Redeployed; checked with a browser-style preflight (`Access-Control-Request-Headers`). Neon kept serving the old copy for about a minute after the deploy completed.
- Outcome: Implemented

---

## Links

- Related ADRs: [ADR-0001](0001-api-key-handling-how-the-openrouter-key-gets-in-and-where-it-lives.md) (the key never goes in the build), [ADR-0010](0010-diabetes-education-bot-how-test-users-reach-it.md) (no server of our own; capped keys per tester), [ADR-0011](0011-database-schema-and-access-rules.md) (access rules), [ADR-0012](0012-model-choice-under-a-15-dollar-openrouter-budget.md) (the $15 budget; per-key limits as the first spending guard)
- Related code: `src/app/ChatPanel.vue` (the key form and the "this chat has used about $…" line), `src/lib/chat/models.ts` (the cost meter)
