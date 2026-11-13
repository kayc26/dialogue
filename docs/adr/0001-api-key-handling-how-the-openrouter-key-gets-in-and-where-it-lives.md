<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0001: API key handling — how the OpenRouter key gets in and where it lives

- **Date**: 2026-11-12
- **Iteration**: 2
- **Status**: Accepted
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: With no backend, the user's OpenRouter key must sit in the browser. Decide how it gets there (pasted, or through OpenRouter's sign-in flow) and what we accept about who else on that origin can read it.

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-12):

> i want to build a simple harness: a chat page interface online
> - github pages only (no backend)
> - openrouter api keys through cors on the front end
> storage in local storage

**Agency Grant**: Recommend; Kay decides.

---

## Explicitation

**What I understand**:

1. **Direct browser calls work. I checked.** I sent CORS preflight requests on 2026-11-12 from a test origin (`https://example.github.io`). OpenRouter answered `access-control-allow-origin: *` and allowed the `Authorization` header on `/api/v1/chat/completions`, `/api/v1/models`, and `/api/v1/auth/keys`. So the no-backend design is viable, including OpenRouter's in-browser sign-in flow, which exchanges a one-time code at `/auth/keys`.
2. **`localStorage` is per origin, not per repo.** That's a non-obvious risk. Every GitHub Pages project site on this account is served from the same origin, `https://kayc26.github.io`. Any page from *another* repo on that account, and any script that page loads, can read a key this app saves in `localStorage`. A separate origin (a custom domain, or a dedicated GitHub account or org) is the only thing that isolates it.
3. **Rendering model output is the other way the key can leak.** If replies are rendered as Markdown/HTML without sanitizing, a prompt-injected reply can run script on our origin and send the key elsewhere. The same applies to any third-party script loaded from a CDN at runtime. These protections apply whichever option wins, so they're listed as follow-ups below.

**Assumptions**:

- Each user brings their own key and pays their own usage. The app never ships a key of its own; a key in a public repo is a key anyone can spend.
- OpenRouter keys can carry a credit limit. I believe that's set in OpenRouter's key settings; verify before relying on it.

**Confirm**: Kay. Do you know of other GitHub Pages projects on this account (now or planned)? That changes how much point 2 matters.

---

## Questions

### QST-KEY-HANDLING: How does the user's OpenRouter key get into the page, and where does it live?
- Status: answered
- Why asking: Harness runs entirely in the browser on GitHub Pages and calls OpenRouter directly (CORS verified 2026-11-12), so the user's key has to be held by the page. Saving it in `localStorage` means it persists across visits, but any other GitHub Pages project on the same account (all served from `kayc26.github.io`) could read it, and so could any script that runs on the page. This choice shapes the settings screen, the first-run experience, and how much harm a leak can do.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Paste a key, keep it in localStorage**: The user creates a key on openrouter.ai, pastes it into a settings field, and it persists across visits. The simplest option. Exposure: everything on the `kayc26.github.io` origin can read it, and if it's the user's general-purpose key, a leak hits everything that key is used for.
- **B — "Connect OpenRouter" sign-in, key in localStorage**: A button sends the user to openrouter.ai to approve the app (OAuth with PKCE, which needs no backend). OpenRouter sends them back with a code, the page exchanges it at `/api/v1/auth/keys` for a key made just for Harness, and the page stores that key. No copy-pasting, and the user can revoke that key alone without breaking their other uses. Pasting a key (A) stays available as a fallback. The storage exposure is the same as A, but a leak is limited to this one revocable key.
- **C — Session only**: The key lives in memory or `sessionStorage` and is gone when the tab closes, so the user re-enters it each visit. Conversations can still persist in `localStorage`. The least exposure, the most friction.
- **D — Isolate the origin**: Serve Harness from its own origin, either a custom domain (about $10–15/year, which breaks "free") or a GitHub account or org used only for this app. Fixes the shared-origin problem itself, and can be combined with A or B.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-12)

**B — "Connect OpenRouter" sign-in, with paste as a fallback.** *Rationale*: Kay asked for `localStorage`, and B honors that while limiting the damage of a leak to one app-specific, revocable key instead of the user's main key. The CORS probe shows the code exchange endpoint (`/auth/keys`) is reachable from a browser, so B needs no backend. C contradicts the "storage in local storage" request for the thing users least want to retype. D costs money or a second account, and is only worth it if other projects share the origin (the Confirm question above). Whatever wins, sanitized rendering and no runtime CDN scripts are required (follow-ups). *Confidence*: 0.7 — because the CORS part is measured, but I haven't yet run the full sign-in round trip with a `github.io` callback URL. *If wrong*: if the sign-in flow won't accept a `kayc26.github.io/harness/` callback, or the round trip fails in a spike, flip to **A**. If Kay already hosts other Pages projects on this account that load third-party scripts, add **D**.

**ANS:** (by Kay)
a, i have an openrouter key

---

## Decision

### Chosen: A — Paste a key, keep it in localStorage

**Rationale**: Kay's answer: "a, i have an openrouter key". Kay already has a key, so pasting it is the shortest path, and the sign-in flow (B) can be added later without changing how the key is stored.

**Trade-offs accepted**: The key persists in `localStorage` on the shared `kayc26.github.io` origin, readable by any other Pages project on the account. If it's Kay's general-purpose key, a leak exposes everything that key is used for. Mitigation, advised in the UI: make a separate key just for Harness, with a credit limit.

### Consequences
- The settings panel has a password-type key field, a **Forget key** button, and a plain note saying the key is stored in this browser's `localStorage` and why a dedicated, limited key is safer.
- The key is never in the repo, a `.env` file, or a GitHub secret. Anything put there at build time would be inlined into the public bundle. `.gitignore` excludes `.env*` as a guard.

---

## Open Follow-ups

- [ ] **Sanitize every rendered reply** (e.g., Markdown → HTML → DOMPurify) before it touches the DOM. This applies to any option, because unsanitized model output is the easiest way to steal the key.
- [ ] **No runtime third-party scripts.** Dependencies are bundled or kept as files in the repo, never `<script src>` from a CDN, since any script on the page can read `localStorage`.
- [ ] A visible **"Forget key"** control, and a first-run note that says plainly where the key is stored.
- [ ] ~~Spike: run the full sign-in round trip from a `github.io` callback~~. Moot under A; reopen if B is ever added.

---

## Iterations

### Iteration 1 (2026-11-12)
- Trigger: Kay's project prompt (chat page, GitHub Pages, OpenRouter via CORS, localStorage)
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Initial draft. CORS verified by preflight probe; shared-origin risk surfaced; QST-KEY-HANDLING posed with a recommendation
- Outcome: Draft

### Iteration 2 (2026-11-12)
- Trigger: Kay's answer to QST-KEY-HANDLING ("a, i have an openrouter key")
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision recorded as A, overriding my recommendation (B). Trade-offs and consequences written; the sign-in spike follow-up marked moot
- Outcome: Draft → Accepted

---

## Links

- Related ADRs: ADR-0002 (stack: how dependencies are bundled affects follow-up 2), ADR-0003 (scope: what gets stored besides the key)
