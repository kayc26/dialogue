# Technical Debt

Workarounds and compromises, each with where it lives and how to retire it (CLAUDE.md, Technical Debt Tracking).

---

## TD-1: Local Node is 23.7 (end-of-life); jsdom pinned to 26 to keep the local gate runnable

- **Discovered**: 2026-11-12, first `vitest run`
- **Location**: `package.json` → `devDependencies.jsdom: ^26.1.0`
- **Issue**: The only Node on the dev machine is Homebrew's 23.7.0 (end-of-life since June 2025). Current jsdom (31) depends on `undici`, which calls a zlib zstd API that Node 23.7 lacks, so `markdown.test.ts` couldn't even start. Vitest 5, Vite 8, and others also list engine ranges that skip 23.x; npm warns (`EBADENGINE`) but they currently run.
- **Impact**: The local gate runs on an unsupported Node. CI (Node 24 LTS, `.github/workflows/deploy.yml`) is the authoritative gate. A dependency upgrade could break the local gate while CI stays green.
- **Workaround**: jsdom 26.1 (engines `>=18`, no `undici`). It's used only by the sanitizer test, so DOM-feature drift doesn't matter.
- **Fix**: Install Node 24 LTS locally (e.g. `brew install node@24`, or add it to asdf with a `.tool-versions`), then bump jsdom to current.
- **Priority**: Medium. It's cheap to fix, and until then local and CI Node differ.

## TD-2: npm 10.9.2 crashes on install; dependencies installed with npm 11

- **Discovered**: 2026-11-12, first `npm install`
- **Location**: the dev machine's global npm (bundled with Node 23.7)
- **Issue**: `npm install` dies with `Cannot read properties of null (reading 'edgesOut')` inside arborist's `#loadPeerSet` (an npm bug in peer-dependency resolution, triggered by Vitest 5's optional peers). `package-lock.json` was produced with `npx npm@11 install`.
- **Impact**: Locally, use `npx npm@11 install` / `npx npm@11 ci` until npm is upgraded. CI on Node 24 ships npm 11 and is unaffected.
- **Fix**: Same as TD-1. Node 24 brings npm 11.
- **Priority**: Low (fixed by TD-1).

## TD-3: A just-woken Neon compute can return an empty first read; reads retry on empty

- **Discovered**: 2026-11-14, while checking the patient view's queries on `rls-dev`
- **Location**: `src/lib/neon/data.ts` (`getNonEmpty`, used by `getMembership` and the patient list in `src/app/PatientView.vue`)
- **Issue**: After Neon suspends an idle compute, the first Data API read when it wakes up can return `200 []` for a signed-in member, as if row-level security saw no user. The next read is correct. Seen 2 times in about 6 cold or idle attempts. Reproduced deliberately once: compute suspended, then sign-in, `/token`, and the first `patients` read returned `[]`, while reads 2 and 3 returned the row. It fails closed (no data leaks), but a member could be told "your account hasn't been added to this demo yet", or see no demo patients.
- **Impact**: Production suspends when idle too, so the first sign-in after a quiet period is the likely trigger. **Writes are probably affected the same way**: a policy that sees no user rejects an insert with 401/403. That matters for chat messages, so the chat step must handle it.
- **Workaround**: Reads that should never be empty retry twice (after 0.5 s, then 1 s) before an empty answer is believed. A genuine non-member waits about 1.5 s longer. Covered by 3 regression tests in `src/lib/neon/auth.test.ts`.
- **Fix**: Report it to Neon with the reproduction (suspend endpoint, sign in, first Data API read), then remove the retry once the platform fixes it. For writes, retry once on 401/403 right after a wake-up, or warm the compute with a read before the first write.
- **Priority**: Medium. A member being told they aren't a member is the kind of failure that makes a demo look broken.

## TD-4: Harness v1 still ships, reachable at `#/harness`

- **Discovered**: 2026-11-14, when the diabetes assistant took over `/`
- **Location**: `src/App.vue`, `src/components/*`, `src/composables/useApp.ts`, `src/style.css`; the switch is in `src/main.ts`
- **Issue**: The original OpenRouter chat client is kept so nothing is lost, but no current decision needs it. Its agent loop, OpenRouter client, and sanitizer in `src/lib/` *are* reused by the diabetes assistant (ADR-0005, orchestration B). The UI isn't.
- **Impact**: Extra code in the bundle (loaded only on `#/harness`) and tests to maintain.
- **Fix**: Once the diabetes chat works, remove the v1 UI files and the `#/harness` branch, and keep `src/lib/`.
- **Priority**: Low.

## TD-5: KB passages carry stale section headings from the chunker

- **Discovered**: 2026-11-14, tracing why "how to lower my blood sugar after a meal" showed how to treat a low
- **Location**: `src/lib/kb/chunk.ts` (section tracking), output in `kb/out/passages.json` and the production `kb_chunks` table
- **Issue**: In the two ADA "Your Rights and Care Standards" guides, a list item or table cell is taken as the current heading and carried forward. Six type 2 passages, `ada-t2-guide-020` to `025`, are all headed "After eating". One of them, `021`, is the hypoglycemia Rule of 15. A type 1 passage about high glucose is headed "Wait 15 minutes". Retrieval counts the section twice, so a wrong heading pulls a passage toward unrelated questions. The heading also shows on source chips.
- **Impact**: Retrieval ranks wrong passages first for after-meal questions, and the patient sees a misleading source label. Partly offset in `src/lib/chat/retrieve.ts`: a passage about the opposite direction keeps only half its score.
- **Fix**: In the chunker, accept a heading only from real heading lines (not list items, table cells, or numbered steps). Then rebuild with `kb:build`, check `kb/out/review.md`, and reload production with `kb:load` (a write to production: Kay's OK first).
- **Priority**: Medium. This is the first thing to fix if testers report off-topic answers.

## TD-6: The book chunks poorly: page-break half-sentences and pull quotes read as headings

- **Discovered**: 2026-11-16, first build of *Bright Spots & Landmines* (ADR-0013 iteration 6)
- **Location**: `src/lib/kb/chunk.ts` (`isHeading`), output in `kb/out/passages.json`
- **Issue**: The heading test accepts any one-line paragraph that starts with a capital and has no closing punctuation. In the book that matches a sentence cut at a page break ("Even after many years, I still"), drop-cap letters ("A", "R"), and pull-quote words ("SMALLER", "EXPECT"). So 120 distinct "sections" for 340 kept passages, many starting mid-sentence; 388 more were skipped as layout fragments. The running page header (`|` then the chapter name) was a fourth case, fixed in the same change that found this.
- **Impact**: Book passages rank on fake headings, and a passage can begin or end mid-thought. Under QST-KB-BOOK-ROLE: A no book passage is shown word for word, so the harm is to retrieval and to the answer model's context, not to what a patient reads directly.
- **Workaround**: none yet; the build is used as is for card drafting, where the drafter reads neighbouring passages.
- **Fix**: Treat a one-line paragraph as a heading only if the next paragraph doesn't continue its sentence (starts lowercase), and reject one-letter and single-word all-caps lines in book sources. Or extract the book with `pdftotext -layout` and use its column structure. Rebuild and compare section counts.
- **Priority**: Medium: the book stays in runtime search (ADR-0013, QST-KB-BOOK-RECHECK: A, Kay 2026-11-16).
