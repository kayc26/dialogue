<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0003: Stack and deploy shape — Vue toolchain, tests, GitHub Pages

- **Date**: 2026-11-12
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay, Tessera (Claude Opus 5.5)

**TL;DR**: Kay fixed Vue, scoped CSS, and free GitHub Pages hosting. What's still open is the build toolchain and language, where the testable game logic lives, and which repo name and URL the site deploys under.

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-12), founding session: "hosted free on GitHub Pages, built with Vue using scoped CSS so styles stay component-local."

**Agency Grant**: Recommend; Kay decides.

---

## Explicitation

**What I understand**:

1. **Scoped CSS forces a build step.** `<style scoped>` is a feature of Vue's single-file-component (`.vue`) compiler. Vue loaded from a CDN with no build has no scoped styles. So "Vue + scoped CSS" already implies a bundler, and for Vue that means Vite.
2. **The gate needs something to test.** CLAUDE.md's Fifth Directive names `npm run gate` (`vitest run && vite build`) and three bug classes it must catch: duplicate-letter scoring, word-list integrity, and a broken Pages `base` path. Those tests are only meaningful if the game logic is plain functions the tests can call without rendering anything (Fourth Directive: test real behavior, not mocks).
3. **GitHub Pages serves a project repo under a subpath.** This repo is `kayc26/harness`, which is public, so Pages is free. Its site would be `https://kayc26.github.io/harness/`, and Vite's `base` must match that subpath exactly or every script and stylesheet 404s and the page loads blank. The repo name is therefore part of the build config, not cosmetic.

**Assumptions**:

- Deploy with the official GitHub Actions Pages workflow (build on push to `main`, publish the `dist/` artifact). I'm not using the older `gh-pages`-branch approach, which commits build output into git.
- **Node version.** This machine runs Node v23.7.0 through asdf, an odd-numbered release without long-term support. CI should pin the current even-numbered LTS release, and local development should match it, so "works on my machine" and "works in CI" mean the same thing. I'll verify the exact version Vite requires when scaffolding instead of assuming it.

**Confirm**: Kay. Is the reasoning that scoped CSS forces a build step correct as you intended it?

---

## Questions

### QST-STACK: Which toolchain and code shape for the Vue app?
- Status: unanswered
- Why asking: Kay fixed Vue with scoped CSS on GitHub Pages. Scoped CSS needs Vue's single-file-component compiler, so there must be a build step. What's still open is the language (TypeScript or JavaScript), the test runner, how game logic is separated from the UI so the gate can test it, and the deploy mechanism. The first commit of code depends on this.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Vite + Vue 3 + TypeScript + Vitest**: Scaffold with `npm create vue@latest` (TypeScript and Vitest on; router, Pinia, and end-to-end testing off). Components are `.vue` files with `<script setup>` and `<style scoped>`. Game logic (scoring, answer picking, guess validation) lives in plain TypeScript modules that never import Vue, and Vitest tests them directly. The UI reads one composable (`useGame`). A GitHub Actions workflow builds and publishes to Pages on every push to `main`.
- **B — Same as A, in JavaScript**: Identical structure, without type annotations or the `vue-tsc` type-check step. Less ceremony for a first project. It loses build-time checks on the data that passes between logic and UI (e.g., a letter's state being exactly `correct | present | absent`), so those slips show up in the browser instead of at `npm run gate`.
- **C — No build step (Vue from a CDN)**: One HTML file, no npm, no bundler. The simplest possible hosting. But `<style scoped>` doesn't exist without the single-file-component compiler, so **this contradicts Kay's scoped-CSS requirement**. It's listed so the exclusion is visible rather than silent.
- **D — Nuxt with static generation**: A full framework (routing, layouts, static site generation) on top of Vue. Far more than a single-screen game needs, with more config to get right for a Pages subpath.

**Recommendation**: (by Tessera, Claude Opus 5.5, 2026-11-12)

**A — Vite + Vue 3 + TypeScript + Vitest.** *Rationale*: Kay's scoped-CSS requirement rules out C, and D's routing and static generation solve problems a one-screen game doesn't have. A and B share the decision that matters most: logic in plain modules, separate from rendering. That's what makes the Fifth Directive's three bug classes testable without mocks, and it's what keeps ADR-0002's two modes cheap. Between A and B, TypeScript adds a type check to the gate at the cost of one checkbox in the official scaffold, and the letter-state and word-list shapes are exactly the kind of data where a typo slips through silently. *Confidence*: 0.75 — because Vite + SFC follows directly from the scoped-CSS requirement, and logic-out-of-components is standard practice I can point to in the gate's own bug list. TypeScript over JavaScript is the judgment part, and it depends on Kay's comfort with TypeScript, which I don't know. *If wrong*: if TypeScript errors start costing Kay more time than the game does (fighting types rather than catching bugs), flip to **B**. The module boundary survives that switch unchanged.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-REPO-HOME: Which repo, and so which URL, does Bytle deploy from?
- Status: unanswered
- Why asking: Free GitHub Pages serves a project at `https://<user>.github.io/<repo-name>/`, and Vite's `base` setting must equal `/<repo-name>/` or the deployed page loads blank. This repo is `kayc26/harness` (public), so today the game would live at `kayc26.github.io/harness/`. The URL is set by the repo name and baked into the build config, so it should be decided before the first deploy.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Rename this repo to `bytle`**: The site becomes `kayc26.github.io/bytle/`. Code and ADRs stay in one repo, so each decision lives next to the code it governs. GitHub redirects the old repo URL after a rename, and the local `origin` remote should be updated too. The ADRs stay public, as they already are.
- **B — Keep `harness`**: The site is `kayc26.github.io/harness/`. Nothing changes, but the URL names the methodology scaffold, not the game.
- **C — Separate `bytle` repo for the game**: Game code goes in a new public repo, and this one keeps the records. The public game repo stays clean, but decisions and code drift apart, a change touches two repos, and the "commit the ADR with the work" habit spans two histories.

**Recommendation**: (by Tessera, Claude Opus 5.5, 2026-11-12)

**A — Rename this repo to `bytle`.** *Rationale*: The URL is what players see, and `harness` describes the scaffold, not the game. Keeping records and code together is the template's own premise (CLAUDE.md, Prime Directive corollary: substrate committed alongside the work), and C splits that. A rename is a one-time settings change that GitHub redirects for us. *Confidence*: 0.85 — because the mechanics (Pages subpath, `base`, rename redirects) are standard GitHub behavior. What I can't see is any outside constraint on this repo. *If wrong*: if CIS7000 or an instructor tracks this repo by the name `harness` (for example, it was created from a course template and gets graded at that URL), flip to **B**.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Decision

Pending the answers to QST-STACK and QST-REPO-HOME.

---

## Action Items

*(After both questions are answered; nothing here starts before then.)*

- [ ] Scaffold the app per QST-STACK, and wire `npm run gate` as the **first** code commit (CLAUDE.md, Fifth Directive) - Owner: Tessera
- [ ] Set Vite `base` per QST-REPO-HOME, and add a gate check that fails if `base` and the repo name disagree - Owner: Tessera
- [ ] Add the GitHub Actions Pages workflow (pin Node LTS) - Owner: Tessera
- [ ] Enable Pages (Settings → Pages → Source: GitHub Actions) and do the repo rename if chosen. These are repo-settings actions only Kay can take - Owner: Kay

---

## Iterations

### Iteration 1 (2026-11-12)
- Trigger: Kay's founding prompt asking for the 2–3 decisions to settle before code
- Contributors: Kay, Tessera (Claude Opus 5.5)
- Changes: Initial draft; QST-STACK and QST-REPO-HOME posed with recommendations. QST-REPO-HOME surfaced while checking the repo: its name `harness` sets the Pages URL.
- Outcome: Draft

---

## Links

- Related ADRs: ADR-0001 (word lists the gate checks), ADR-0002 (play modes the engine/UI split keeps cheap)
- Related: CLAUDE.md Fifth Directive (the gate this ADR wires)
