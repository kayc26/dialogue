<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0015: Rename the project from Harness to DIAlogue

- **Date**: 2026-11-16
- **Iteration**: 2
- **Status**: Implemented
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: The project is now called DIAlogue. The visible name changes everywhere (README, CLAUDE.md, package, page title, OpenRouter label, GitHub repo), while the historical record and Harness v1's internal identifiers (storage keys, export format, `#/harness` route) stay as they are, so nothing a user saved breaks.

---

## Originating Context

**Source**: Kay, 2026-11-16, in conversation: "I'd like to change the name "harness" to DIAlogue everywhere, what changes do i need to make", then "i can rename the git repo, and no invites has been sent yet".

**Agency Grant**: Kay asked what changes are needed, then confirmed the repo rename. Nibble makes the in-repo edits; Kay renames the GitHub repo and, optionally, the local folder.

---

## Explicitation

**What I understand**:

1. "harness" means three things in this repo, and only the first two are names:
   - the **project** (README title, `package.json`, CLAUDE.md, the GitHub repo and its Pages URL);
   - **Harness v1**, the general OpenRouter chat client the repo started as, still served at `#/harness` (ADR-0001 to 0003, TD-4);
   - the **ordinary word** ("agent harness", "the Claude Code harness") in template-supplied files: CHANGELOG, justfile, `scripts/`, `.claude/skills/`. These don't name this project and stay.
2. Renaming the GitHub repo moves the site from `kayc26.github.io/harness/` to `kayc26.github.io/<new-name>/`. GitHub redirects git remotes after a rename, but not the Pages URL. No tester invites have gone out, so nothing breaks now.
3. Nothing else depends on the path:
   - the model proxy's allowed origins (`neon.ts`, `src/lib/proxy/policy.ts`) are `https://kayc26.github.io` with no path;
   - sign-in uses no redirect URLs;
   - the build uses relative asset paths (ADR-0002).

**Assumptions**:

- DIAlogue names the whole project; the diabetes assistant is what the site serves.
- The historical record (ADRs, vignettes, inbox, `scripts/ephemeral`, past CHANGELOG entries) keeps saying "Harness" for what it was then.

---

## Questions

### QST-V1-NAME: What happens to Harness v1's name?
- Status: answered
- Why asking: Harness v1 is the general OpenRouter chat client the repo started as, still reachable at `#/harness`. Its UI says "Harness", and its `localStorage` keys (`harness.state`, `harness.apiKey`, `harness.notes.v1`) and export files (`app: 'harness'`) carry the name. Renaming those keys without a migration silently loses saved conversations and makes old exports unreadable.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — keep it as the ancestor**: Harness v1 keeps its name, UI text, route, storage keys and export format. Docs describe it as "Harness v1, the chat client DIAlogue grew from".
- **B — rename the visible parts only**: the v1 UI says "DIAlogue (v1 chat client)"; route, keys and export format stay `harness` as internal identifiers.
- **C — rename everything, with a migration**: new keys and route, plus code that moves old keys, accepts old exports and redirects `#/harness`, with regression tests (Fifth Directive: older-format storage must load as migrated).
- **D — delete Harness v1 now**: resolves TD-4; removes the v1 UI and route, keeps the shared `src/lib/` modules.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)

**A — keep it as the ancestor.** *Rationale*: the name is historically accurate (ADR-0001 to 0003 decided "Harness"), v1 is not tester-facing (ADR-0014 Consequences), and A costs nothing and risks no saved data. C spends code and tests on a page TD-4 already plans to remove; D is a larger change than a rename should carry. *Confidence*: 0.8 — because the only users of v1 are Kay and Nibble, and TD-4 already plans its removal. *If wrong*: if Kay wants a single name on everything a viewer can see, this flips to B; if v1 is no longer wanted at all, to D.

**ANS:** (by Kay)
a

---

### QST-REPO-CASE: What exact name does the GitHub repo get?
- Status: answered
- Why asking: the repo name becomes the site's path. The README link, the git remote and anything sent to testers use it.
- Need: pick a letter (or override)

Options:
- **A — `dialogue`**: all lowercase; the site is `https://kayc26.github.io/dialogue/`.
- **B — `DIAlogue`**: the brand's casing in the URL; the site is `https://kayc26.github.io/DIAlogue/`.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)

**A — `dialogue`.** *Rationale*: GitHub's own settings print Pages URLs in lowercase, and a lowercase path can't be mistyped by case. Nibble has not verified whether Pages matches a mixed-case path case-insensitively. *Confidence*: 0.7 — because it rests on convention, not a test. *If wrong*: if Kay wants the brand visible in the link and a test shows both casings load, this flips to B.

**ANS:** (by Kay)
a

---

## Decision

### Chosen: rename the visible name; keep the record and v1's identifiers (Kay, 2026-11-16)

**What changes** (Nibble, in the repo):
- README title, intro and link; `package.json` / `package-lock.json` name `dialogue` (npm requires lowercase); CLAUDE.md's project name and its out-of-date "What we're building" paragraph.
- The diabetes app's page title, and the `X-Title` the chat sends to OpenRouter (the label in OpenRouter's dashboard).
- Comments that name the project: `.github/workflows/deploy.yml`, `.gitignore`, `vite.config.ts`.

**What Kay does**: renames the GitHub repo, then `git remote set-url origin`; optionally renames the local folder and copies `~/.claude/projects/-Users-kaychen-CIS7000-harness/` to the new folder's name, which holds Claude Code's memory for this project (e.g. the $15 budget note).

**What stays**: ADRs, vignettes, inbox, `scripts/ephemeral`, past CHANGELOG entries; the ordinary word "harness" in template files; the Neon project (`diabetes-chatbot`); Harness v1 as decided in QST-V1-NAME.

**Trade-offs accepted**: the record and the code say "Harness" in places a newcomer will meet. The README says once why.

### Consequences
- The old Pages URL stops working after the repo rename. Nothing has been sent, so nothing breaks.
- The proxy and sign-in need no change (origin-only checks).

---

## Action Items

- [x] Make the in-repo edits, run the gate, commit (`30eb0f1`, `6121e50`). Owner: Nibble
- [x] Rename the GitHub repo to `dialogue`, set the new remote, push (deployed 2026-11-17, run 43997692940). Owner: Kay, Nibble
- [x] Rename the local folder to `~/CIS7000/dialogue` and copy Claude Code's project memory. Owner: Kay
- [ ] After the first deploy at the new URL, sign in there and check an answer. Owner: Kay
- [ ] Delete the old memory folder `~/.claude/projects/-Users-kaychen-CIS7000-harness/` once the new one is confirmed. Owner: Kay

---

## Iterations

### Iteration 1 (2026-11-16)
- Trigger: Kay asked to rename "harness" to DIAlogue everywhere; Nibble listed what changes and what breaks; Kay confirmed the repo rename (no invites sent).
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Scope written up; two naming questions left open with recommendations Nibble proceeds on.
- Outcome: Accepted (two questions open)

### Iteration 2 (2026-11-16)
- Trigger: Kay answered QST-V1-NAME (A) and QST-REPO-CASE (A); renamed the repo and the local folder; said "push".
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - Both answers match what was built: Harness v1 keeps its name, route, storage keys and export format; the repo is `dialogue`.
  - Pushed; the deploy passed the gate and `https://kayc26.github.io/dialogue/` serves the page with the new title.
  - Not yet checked: a signed-in answer at the new URL.
- Outcome: Accepted → Implemented (no questions open)

---

## Links

- Related ADRs: [ADR-0001](0001-api-key-handling-how-the-openrouter-key-gets-in-and-where-it-lives.md) to [ADR-0003](0003-v1-scope-what-makes-it-a-harness-and-not-just-a-chat-box.md) (Harness v1), [ADR-0010](0010-diabetes-education-bot-how-test-users-reach-it.md) (how testers reach the site), [ADR-0014](0014-shared-openrouter-account-with-a-1-dollar-cap-per-tester.md) (proxy origins)
- Related code: `src/lib/openrouter.ts` (`X-Title`), `src/lib/proxy/policy.ts` and `neon.ts` (allowed origins), `src/main.ts` (`#/harness`), `src/lib/storage.ts` (v1 keys and export format)
