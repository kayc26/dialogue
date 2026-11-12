<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0002: Stack — how the page is built and tested

- **Date**: 2026-11-12
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Choose between plain files served as-is, a bundled build without a framework, and a component framework. The answer also sets CLAUDE.md's verification gate, which is left unfilled until then.

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-12): "a simple harness: a chat page interface online — github pages only (no backend)". No framework or language was named.

**Agency Grant**: Recommend; Kay decides.

---

## Explicitation

**What I understand**:

1. **"Simple" and "GitHub Pages only" both favor little tooling.** Pages can serve the repo's files directly, with no build step at all.
2. **A chat page still has real logic to test.** That includes parsing OpenRouter's streamed replies (server-sent events), building the request from stored history, and reading and writing `localStorage` safely across format changes. The gate (CLAUDE.md, Fifth Directive) needs a test runner whichever stack wins.
3. **The stack affects key safety.** ADR-0001's follow-ups ban runtime CDN scripts, so dependencies like a Markdown renderer and a sanitizer must be bundled or kept as files in the repo.

**Assumptions**:

- Kay chose Vue with scoped CSS for the previous project idea (now dropped). I'm treating that as a mild preference signal, not a requirement.
- Deploy is either Pages serving the repo directly (no build) or a GitHub Actions workflow that publishes a build output folder.

**Confirm**: Kay. Do you want a framework here at all?

---

## Questions

### QST-STACK: How is the page built and tested?
- Status: unanswered
- Why asking: Harness is a browser-only chat page on GitHub Pages. Kay asked for "simple" and named no framework. Pages can serve plain files directly, or serve the output of a build. The choice decides how dependencies (Markdown rendering, HTML sanitizing) get in without CDN scripts (ADR-0001), what runs the tests, and therefore what CLAUDE.md's verification gate is.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — No build: plain HTML + JavaScript modules**: One `index.html`, a few `.js` modules, and hand-written CSS. Dependency files are kept in the repo, and Pages serves the repo as-is (no Actions workflow). Tests run with Node's built-in test runner (`node --test`) on the logic modules. Nothing to install to run the site. UI updates are manual DOM code, which gets tedious as the interface grows (conversation list, settings, model picker).
- **B — Vite + TypeScript, no framework**: A small build step with npm-pinned dependencies, Vitest for tests, and a GitHub Actions workflow to deploy. Types check the shapes of OpenRouter requests and replies and of stored data. Still manual DOM code for the UI.
- **C — Vite + Vue 3 + TypeScript**: As B, plus Vue single-file components with scoped CSS. Message list, sidebar, and settings become components with reactive state, which suits a UI that will grow. The most tooling of the three.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-12)

**C — Vite + Vue 3 + TypeScript.** *Rationale*: A "harness" tends to grow controls (model, parameters, inspection; see ADR-0003), and reactive components handle that better than hand-written DOM updates, which is A's and B's weak spot. Kay picked Vue with scoped CSS for the earlier idea, so it's a known preference. A build step also bundles dependencies, which satisfies ADR-0001's no-CDN-scripts rule without manually copying library files. Gate under C: `vue-tsc && vitest run && vite build`. *Confidence*: 0.6 — because this depends heavily on what "simple" means to Kay and on ADR-0003's scope, and neither is known yet. *If wrong*: if "simple" means "no tooling, view-source-able," or if ADR-0003 lands on a minimal v1, flip to **A**.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Decision

Pending the answer to QST-STACK. When it's answered, fill CLAUDE.md's `⟦VERIFICATION-GATE⟧` and `⟦GATE-WHY⟧`, and wire the gate as the first code commit.

---

## Iterations

### Iteration 1 (2026-11-12)
- Trigger: Kay's project prompt
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Initial draft; QST-STACK posed with a recommendation
- Outcome: Draft

---

## Links

- Related ADRs: ADR-0001 (key safety constrains how dependencies are loaded), ADR-0003 (scope decides how much UI there is)
- Related: CLAUDE.md Fifth Directive (the gate this ADR decides)
