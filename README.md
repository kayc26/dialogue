# Harness: a diabetes education assistant inside a patient portal (demo)

A browser-only web app, hosted on GitHub Pages, that puts an AI diabetes education assistant inside a mock patient-portal Message Center. It is built for testing with invited testers and synthetic patients. It is **not** a medical device and does not give medical advice: it answers general education questions from an approved knowledge base, refuses dose questions, and routes anything urgent to the care team or 911.

**Try it: <https://kayc26.github.io/harness/>** (sign-in required; accounts are created by an admin).

There is no backend of our own. The page talks directly to:

- **Neon** (Postgres with row-level security, the Neon Data API, and Neon's managed Better Auth) for sign-in, membership, demo patients, the knowledge base, and conversation logs.
- **OpenRouter** for the language models, using the tester's own API key, which is kept only in that tester's browser.

The same site also still serves **Harness v1**, the general-purpose OpenRouter chat client this repo started as, at `#/harness` (see [below](#harness-v1-the-general-chat-client)).

---

## What a tester sees

1. **Sign in.** Accounts are created by an admin. A new tester sets a password with an emailed code. Being signed in grants nothing by itself: access comes from a row in `public.members`.
2. **The portal home.** An unbranded copy of a patient portal's Message Center. Parts of the portal that aren't part of the demo say so when clicked. A working High Contrast Theme switch is in the footer.
3. **The assistant window.** One button opens a docked "New message" window with a yellow "not for emergencies" banner. The tester picks one of six demo patients, sees that patient's recorded insulin regimen and recent glucose (read-back only), and chats.
4. **"Get help now"** is always on screen. It is plain HTML and CSS in `index.html`, outside the Vue app, so it works even if the app or the models fail.

Each assistant reply is one of: an escalation card (nurse line or 911), a dose-refusal card, an approved passage shown word for word, a short model-written answer with source chips ("American Diabetes Association", "Your care team", or the book by name), or "I don't have information on that."

Roles: `patient_tester` sees the patient view, `careteam_tester` the care-team view, `admin` both. The care-team inbox (shared summaries and nurse replies, ADR-0008) has its tables and access rules in the database but is **not built in the UI yet**.

---

## How one patient message is answered

The pipeline lives in [`src/lib/chat/turn.ts`](src/lib/chat/turn.ts). Model calls are injected, so every ordering guarantee below is tested offline.

1. **Fixed-rule triage** ([`triage.ts`](src/lib/chat/triage.ts)) runs first, locally and instantly, on every message. Tiers: `emergency`, `urgent` (the clinic's red flags, such as glucose over 350, high with ketones or a DKA history, severe or repeated lows, pump failure, pregnancy), `distress`, `checkin`, `none`. An emergency stops the turn here, with no model call. Patterns lean broad on purpose.
2. **Model classifier**, combined with the rules ([`combine.ts`](src/lib/chat/combine.ts)): the higher tier wins. The classifier may soften a rules hit by one step for a question *about* symptoms, never to `none` and never an emergency. A slow or failed classifier counts as at least `checkin`.
3. **Dose questions** get a fixed refusal card. The answer model is never called.
4. **Topic cards** (ADR-0013, currently paused, see below): search shortlists up to three sponsor-approved cards, a model picks one id or "none", code checks the pick, and a picked card is shown word for word.
5. **Retrieval** ([`retrieve.ts`](src/lib/chat/retrieve.ts)): in-browser BM25 over the knowledge-base passages, with everyday words ("sugar", "going low") expanded to the clinical terms the passages use. Passages for the other diabetes type rank lower. Nothing relevant means "no information", with no model call.
6. **Answer**: a small agent loop (a `search_kb` tool, at most 3 rounds) writes a short, cited answer from the passages.
7. **Guard** ([`guard.ts`](src/lib/chat/guard.ts)) checks every model-written answer before display: no dose advice, every number must appear in a cited passage or the patient's own message, and citations must name passages the model was actually shown. A blocked answer falls back to the best approved passage, verbatim.
8. **Monitor** (ADR-0007, currently paused): a second model reviews the conversation; in a dose-flagged session it must approve before display.

Each turn, its triage events, and a note on every model call (model, timing, finish reason, token counts; never the prompt or the key) are saved to Neon by [`persist.ts`](src/lib/chat/persist.ts). Saving never blocks the patient.

### Rules the code enforces, whatever a model does

- Dose-tagged passages are never given to a model.
- Book passages can inform a written answer but are never shown word for word, and their numbers never count for the guard.
- Without an OpenRouter key, or when a model call fails, triage still runs and still shows help. The help path never depends on the key.

### Current switches

Set in [`src/lib/chat/prompts.ts`](src/lib/chat/prompts.ts):

| Switch | Value now | Why |
|---|---|---|
| `MONITOR_PAUSED` | `true` | Paused while answer and classifier failures were diagnosed (2026-11-14). |
| `CARDS_PAUSED` | `true` | A trial of retrieval only (ADR-0013, 2026-11-16). The card code stays. |

### Models and cost (ADR-0012)

| Role | Model | Output cap |
|---|---|---|
| Answer | `anthropic/claude-haiku-5.5` | 1500 tokens |
| Card picker | `anthropic/claude-haiku-5.5` | 600 tokens |
| Classifier | `openai/gpt-oss-20b` | 400 tokens |
| Monitor | `openai/gpt-oss-20b` | 400 tokens |

The project works to a $15 OpenRouter budget; the chat panel keeps a running cost total. A shared account with a $1 cap per tester is proposed in ADR-0014 (draft, open question).

---

## Data

### Database and access rules

SQL migrations are in [`db/migrations/`](db/migrations/):

- `0001_schema_and_rls.sql`: members, patients, glucose readings, knowledge-base passages, sessions, messages, triage events, summaries, and nurse replies, all with row-level security and least-privilege grants. The care team sees a session only once its summary is shared; a summary the patient keeps stays private.
- `0002_role_names.sql`: the `patient_tester` / `careteam_tester` / `admin` roles.
- `0003_kb_cards_and_sources.sql`: source labels, year and diabetes type on passages, and the `kb_cards` table. A card goes back to draft automatically if its text, its sources, or its source passages change.

Content tables are written only with the owner connection string (from the scripts below). The browser only reads them. The public endpoints in [`src/config.ts`](src/config.ts) are safe to publish because sign-in and row-level security decide what they return.

### Knowledge base

Sources are listed in [`kb/manifest.json`](kb/manifest.json), highest priority first: the care team's clinician FAQ, then American Diabetes Association guides and handouts, then *Bright Spots & Landmines* (Adam Brown). **The source text is copyrighted and is never committed.** Only the code and the manifest are in git; extracted passages stay in the git-ignored `kb/out/`.

| Command | What it does |
|---|---|
| `npm run kb:build -- --kb-dir "<folder>"` | Extract, split, and tag passages (needs `pdftotext` from poppler). Writes `kb/out/passages.json` and a review file. |
| `npm run kb:load -- --yes` | Replace `kb_chunks` with the built passages and re-sync card hashes. |
| `npm run kb:cards:check` | Check card drafts: sources exist, the guard passes, reading level. No model calls. |
| `npm run kb:cards:load -- --yes` | Load card drafts (they arrive as drafts). |
| `npm run kb:cards:approve -- --by "<name>" <ids> --yes` | Record the clinical sponsor's approval, card by card. |
| `npm run kb:faq-compare` | Compare cards with the care-team FAQ. No model calls. |
| `npm run kb:eval-faq` | Run test questions through the real pipeline and models; writes answers beside reference answers. |

Scripts that touch the database or OpenRouter read `DATABASE_URL` and `OPENROUTER_API_KEY` from a git-ignored `.env.local`, and are dry runs unless given `--yes`.

### Demo patients (ADR-0009)

Six personas in [`patients/personas.json`](patients/personas.json), each walking one path through the clinic's triage flowchart:

| Patient | Path |
|---|---|
| Helen | Quick advice: no red flag |
| Robert | Glucose above 350, plus a new steroid start |
| George | DKA history with high glucose; pump failure; new pump start |
| Dorothy | Severe low, or more than 2 lows in 48 hours |
| Mei | Pregnancy |
| Walter | High-touch from history only (no recent visit, frequent calls) |

Glucose readings and insulin regimens come from real, de-identified recordings in the **ShanghaiT1DM and ShanghaiT2DM** datasets (Zhao Q, Zhu J, Shen X, et al., *Scientific Data* 10, 35 (2023), [doi:10.6084/m9.figshare.c.6310860](https://doi.org/10.6084/m9.figshare.c.6310860), CC BY 4.0). Timestamps are re-anchored to load time and windows trimmed; names, clinic history, and profile flags are fictional. The regimen is shown back to the tester and is never sent to a model.

Build with `python -I patients/build.py --dataset "<unzipped folder>"` (Python 3.12; see `patients/requirements.txt`), load with `npm run patients:load -- --yes`.

---

## Harness v1: the general chat client

Open the site with `#/harness` to get the original app (ADR-0001 to 0003): a general OpenRouter chat client with a model picker, conversations kept in `localStorage`, streamed replies, and an agent loop with three browser-side tools (calculator, time, notes) and an 8-round cap. Its code is `src/App.vue`, `src/components/`, `src/composables/`, and the shared modules in `src/lib/` (SSE parsing, tool-call assembly, the agent loop, sanitized Markdown rendering, storage that survives corrupt or old data). The diabetes assistant reuses the same OpenRouter client and agent loop.

---

## Project layout

```
src/
  main.ts            picks the app: diabetes assistant (default) or Harness v1 (#/harness)
  config.ts          public Neon Auth and Data API endpoints
  app/               diabetes assistant UI: sign-in, portal home, assistant window, patient view, chat
  lib/chat/          the turn pipeline: triage, classifier merge, retrieval, cards, guard, models, prompts, persistence
  lib/kb/            passage chunking and tagging (shared with kb/build.ts)
  lib/neon/          auth and Data API clients
  lib/patients/      read-back of regimens and glucose
  lib/*.ts           Harness v1 core: OpenRouter client, SSE, agent loop, tools, storage, markdown
  App.vue, components/, composables/   Harness v1 UI
db/                  SQL migrations and live-database tests
kb/                  knowledge-base build, load, card review, and evaluation scripts
patients/            demo-patient personas, build and load scripts, fixtures
docs/adr/            decision records (start here for the why)
docs/mockups/        the portal-assistant mockup the UI follows
scripts/ephemeral/   dated one-off investigation scripts
```

---

## Development

Node 24 (the CI version). If you use asdf, `source .claude/agent.env` first.

```bash
npm ci
npm run dev            # local dev server
npm run gate           # vue-tsc --build && vitest run && vite build; must be green before any commit
npm run test:db        # live-database tests against a Neon branch (not part of the gate)
```

`npm run test:db` needs `RLS_AUTH_URL`, `RLS_DATA_API_URL`, `RLS_PASSWORD`, and `RLS_OWNER_DATABASE_URL` for a test branch. A development build can point the app at another Neon branch with `VITE_NEON_AUTH_URL` and `VITE_NEON_DATA_API_URL`.

Never put a key or connection string in the repo or the build: `.env` files are git-ignored, and anything a Vite build reads from them would end up in the public bundle.

### Deploy

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs the gate and publishes `dist/` to GitHub Pages on every push to `main`. A red gate never deploys. The build uses relative asset paths, so it works under any Pages subpath.

---

## Decision record

Every design decision is written down in [`docs/adr/`](docs/adr/), with the questions asked, the answers given, and how each decision changed over time.

| ADR | Topic | Status |
|---|---|---|
| [0001](docs/adr/0001-api-key-handling-how-the-openrouter-key-gets-in-and-where-it-lives.md) | API key handling | Accepted |
| [0002](docs/adr/0002-stack-how-the-page-is-built-and-tested.md) | Stack and verification gate | Accepted |
| [0003](docs/adr/0003-v1-scope-what-makes-it-a-harness-and-not-just-a-chat-box.md) | Harness v1 scope | Accepted |
| [0004](docs/adr/0004-portal-assistant-an-ai-chatbot-inside-a-patient-portal-message-center.md) | Assistant inside a patient-portal Message Center | Accepted |
| [0005](docs/adr/0005-diabetes-education-bot-architecture-and-answer-path.md) | Architecture and answer path | Accepted |
| [0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md) | Urgent-situation triage and escalation | Accepted |
| [0007](docs/adr/0007-diabetes-education-bot-a-second-model-that-monitors-the-conversation.md) | Monitor model | Accepted |
| [0008](docs/adr/0008-diabetes-education-bot-intake-conversation-summary-and-nurse-handoff.md) | Conversation summary and nurse handoff | Accepted |
| [0009](docs/adr/0009-diabetes-education-bot-synthetic-patients-glucose-data-and-insulin-regimens.md) | Synthetic patients and glucose data | Accepted |
| [0010](docs/adr/0010-diabetes-education-bot-how-test-users-reach-it.md) | How test users reach it | Accepted |
| [0011](docs/adr/0011-database-schema-and-access-rules.md) | Database schema and access rules | Accepted |
| [0012](docs/adr/0012-model-choice-under-a-15-dollar-openrouter-budget.md) | Model choice under a $15 budget | Accepted |
| [0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md) | Knowledge base: raw passages or topic cards | Accepted |
| [0014](docs/adr/0014-shared-openrouter-account-with-a-1-dollar-cap-per-tester.md) | Shared OpenRouter account, $1 cap per tester | Draft |

Known compromises are tracked in [`docs/TECHNICAL-DEBT.md`](docs/TECHNICAL-DEBT.md).

### How this repo is worked on

The project is built by a human (Kay) with Claude, using the [ADRs4AI human-AI collaboration template](https://github.com/ADRs4AI/human-ai-collaboration-template-A). [`CLAUDE.md`](CLAUDE.md) holds the working rules (record decisions as ADRs right away, a regression test for every fixed bug, the gate before every commit), and [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) explains the method. `just adr "<title>"` creates the next ADR. The template's own quick start is kept in [`QUICK-START.md`](QUICK-START.md).

---

## License

The repository's [`LICENSE`](LICENSE) (Apache 2.0) and [`NOTICE`](NOTICE) come from the template this project was created from. Knowledge-base source documents are not part of the repository. Demo-patient data is derived from the ShanghaiT1DM/T2DM datasets under CC BY 4.0, credited above.
