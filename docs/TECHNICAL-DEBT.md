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
