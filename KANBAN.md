# Kanban

The project's work at a glance, built from the ADRs, `docs/TECHNICAL-DEBT.md`, and what the code actually does (checked 2026-11-16). Each card names where its details live. Decisions stay in the ADRs; this board only tracks the work.

Columns: **Waiting** (blocked on a person's answer or material), **To do** (ready to start, highest priority first), **In progress**, **Backlog** (open ideas, not yet committed to), **Done**.

---

## Waiting

- [ ] **Kay: clinician requirements for the summary fields.** They replace ADR-0008's field table; the summary mechanism can be built before they arrive. [ADR-0008](docs/adr/0008-diabetes-education-bot-intake-conversation-summary-and-nurse-handoff.md)
- [ ] **Clinical sponsor: review and approve topic cards** (`npm run kb:cards:approve`). [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)
- [ ] **Clinical sponsor: more nutrition material.** 7 of the 13 FAQ questions are nutrition and the current sources answer them thinly. [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)
- [ ] **Clinician: check the demo patients' regimens and glucose traces for plausibility.** [ADR-0009](docs/adr/0009-diabetes-education-bot-synthetic-patients-glucose-data-and-insulin-regimens.md)
- [ ] **Course staff: does user testing with older adults need an IRB exempt determination?** Ask before recruiting anyone. [ADR-0005](docs/adr/0005-diabetes-education-bot-architecture-and-answer-path.md)

## To do

### Safety (before testers outside the team)

- [ ] **TD-7: catch dose advice written in words** ("take two units", "a few extra units", "a bit more insulin"). Priority high: with the monitor paused, the guard is the only check on model-written dose advice. Add a regression test with the three example sentences. [TECHNICAL-DEBT](docs/TECHNICAL-DEBT.md), `src/lib/chat/guard.ts`
- [ ] **Unpause the monitor** (`MONITOR_PAUSED = false` in `src/lib/chat/prompts.ts`) once answers come through reliably. [ADR-0007](docs/adr/0007-diabetes-education-bot-a-second-model-that-monitors-the-conversation.md)

### Conversation summary and nurse handoff (ADR-0008: decided, not built)

Nothing in the app writes to `summaries` or `replies` today; the tables and their access rules exist (`db/migrations/0001`, `0002`) and are tested.

- [ ] **Follow-up questions:** 3 to 5, only about what the patient raised, one per screen, yes / no / skip buttons. Fields not asked are marked "not asked".
- [ ] **Structured summary:** fields with a value and the turn it came from; code checks each value against its cited turn; transcript attached; no free narrative.
- [ ] **End of conversation and sharing:** red-flag or high-touch conversations go to the care team automatically (patient told at the start); otherwise "Send to my care team" or "Just keep it for me".
- [ ] **Patient's copy:** generated from the fields by a template, with print / save as PDF, and "What happens next" (call for red flags, typed reply otherwise; urgent problems mean calling now).
- [ ] **Care-team inbox view:** replaces "Coming next" in `src/app/HomeScreen.vue`; shared summaries with their transcripts; says plainly that the nurse decides, not the bot.
- [ ] **Nurse replies:** typed in the inbox, shown to the patient next visit in large type, read aloud.
- [ ] **Turnaround wording** for the patient summary (when to expect a reply).
- [ ] **Mark ADR-0008 as decided but not yet implemented**, so "Accepted" isn't read as "built".

### Knowledge base

- [ ] **TD-5: stale section headings from the chunker** (list items and table cells taken as headings in the ADA guides). Then rebuild, review, and reload. [TECHNICAL-DEBT](docs/TECHNICAL-DEBT.md)
- [ ] **TD-6: the book chunks poorly** (page-break half-sentences and pull quotes read as headings). [TECHNICAL-DEBT](docs/TECHNICAL-DEBT.md)
- [ ] **Show the source date on chips** ("From ADA, retrieved {date}"); `kb/manifest.json` already has `snapshotDate`. [ADR-0005](docs/adr/0005-diabetes-education-bot-architecture-and-answer-path.md)

### Testing with users

- [ ] **Test protocol for moderated sessions:** tasks (nutrition question, high reading, dose question), what to observe, consent wording. [ADR-0010](docs/adr/0010-diabetes-education-bot-how-test-users-reach-it.md)
- [ ] **Public-site notice for strangers** that the link alone is a non-working preview. The sign-in screen already asks not to type real health information. [ADR-0010](docs/adr/0010-diabetes-education-bot-how-test-users-reach-it.md)

### Shared key (ADR-0014)

- [ ] **Redeploy `llm` to rls-dev**: it still runs the version without the `X-Title` fix, so browsers are blocked there. [ADR-0014](docs/adr/0014-shared-openrouter-account-with-a-1-dollar-cap-per-tester.md)

### Housekeeping

- [ ] **TD-1: install Node 24 locally** to match CI, then bump jsdom. [TECHNICAL-DEBT](docs/TECHNICAL-DEBT.md)
- [ ] **Fix the stale comment in `src/lib/chat/retrieve.ts`** ("136 passages"; production has 472).

## In progress

- [ ] **Retrieval-only trial:** topic cards paused (`CARDS_PAUSED = true`) to see how raw-passage answers do on their own. [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)
- [ ] **Answer quality runs** with `npm run kb:eval-faq` (FAQ back in the knowledge base; other test questions via `--questions`). [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)

## Backlog

- [ ] After an escalation, check in on the next turn ("Are you feeling better?"). [ADR-0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md)
- [ ] Caregiver wording for reports about someone else ("my wife won't wake up"). [ADR-0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md)
- [ ] Have a clinician confirm which ADA passages are used for the urgent cards (low treatment, "while you wait", DKA). [ADR-0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md)
- [ ] Regimen read-back can act as dose advice if the record is stale: decide how to handle "what should I take tonight?". [ADR-0005](docs/adr/0005-diabetes-education-bot-architecture-and-answer-path.md)
- [ ] Revisit QST-TRIAGE-CGM now that readings are re-anchored to load time. [ADR-0009](docs/adr/0009-diabetes-education-bot-synthetic-patients-glucose-data-and-insulin-regimens.md)
- [ ] If approved cards cover the common questions, does the answer model still earn its place for them? [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)
- [ ] Under real patient data, monitor-verdict logs would be protected health information too. [ADR-0007](docs/adr/0007-diabetes-education-bot-a-second-model-that-monitors-the-conversation.md)

## Done

- [x] Harness v1: OpenRouter chat client with streaming, tool calls, an 8-round agent loop, and `localStorage` (now at `#/harness`). ADR-0001 to 0003
- [x] Verification gate (`npm run gate`) and GitHub Pages deploy that never ships a red gate. ADR-0002
- [x] Portal Message Center UI with the docked assistant window, High Contrast Theme, and the always-on "Get help now" path outside the Vue app. ADR-0004, ADR-0006
- [x] Sign-in with admin-created accounts and access by membership; patient, care-team, and admin roles. ADR-0010, ADR-0011
- [x] Database schema and row-level security, with live tests for every table and the consent rules. ADR-0011
- [x] Fixed-rule triage plus the model classifier, combined so the classifier can't clear a rules hit. ADR-0006
- [x] Dose refusal card; dose-tagged passages never given to a model. ADR-0005
- [x] In-browser search with everyday-word expansion and diabetes-type ranking. ADR-0005, ADR-0013
- [x] Cited answers from a small agent loop, checked by the guard, with a verbatim-passage fallback. ADR-0005
- [x] Each turn, its triage events, and per-call model notes saved to Neon, including which card or passage answered. ADR-0008, ADR-0013
- [x] Six demo patients from ShanghaiT1DM/T2DM, with regimen and glucose read-back. ADR-0009
- [x] Knowledge base build and load, with source priority care-team FAQ, then ADA, then the book; book text never shown word for word. ADR-0013
- [x] Topic-card pipeline: drafts, checks (guard, sources, reading level), load, sponsor approval by name, automatic return to draft when sources change, FAQ comparison. ADR-0013
- [x] Models chosen under the $15 budget, with a running cost total. ADR-0012
- [x] QST-KEY-SHARING answered (C: a Neon Function holding the shared key). ADR-0014
- [x] Model proxy `llm` built and deployed to rls-dev and production: sign-in and membership check, model allow-list, $1 cap per tester (admin metered, not capped), cost recorded in `llm_spend` (migration 0004). ADR-0014
- [x] Chat shows "N% of your test allowance" instead of dollars; no key form for testers. ADR-0014
- [x] Proxy CORS preflight fixed (`X-Title` allowed), with a regression test. ADR-0014
- [x] Signed-in call verified live: allowance line, answers, cost rows in `llm_spend`. ADR-0014
- [x] Project renamed to DIAlogue; site moved to `kayc26.github.io/dialogue/`. ADR-0015
- [x] README rewritten to describe the current code base, including the shared-key proxy.
