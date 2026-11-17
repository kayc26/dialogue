# Kanban

The project's work at a glance, built from the ADRs, `docs/TECHNICAL-DEBT.md`, and what the code actually does (checked 2026-11-16). Each card names where its details live. Decisions stay in the ADRs; this board only tracks the work.

Columns: **Waiting** (blocked on a person's answer or material), **To do** (ready to start, highest priority first), **In progress**, **Backlog** (open ideas, not yet committed to), **Done**.

---

## Waiting

- [ ] **Clinical sponsor's reply, then Kay: clinician requirements for the summary fields.** Kay (2026-11-17): the summary work waits for the sponsor's reply, so the whole "Conversation summary and nurse handoff" group below is on hold until then. The replies replace ADR-0008's field table. [ADR-0008](docs/adr/0008-diabetes-education-bot-intake-conversation-summary-and-nurse-handoff.md)
- [ ] **Clinical sponsor: review and approve topic cards** (`npm run kb:cards:approve`). [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)
- [ ] **Clinical sponsor: more nutrition material.** 7 of the 13 FAQ questions are nutrition and the current sources answer them thinly. [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)
- [ ] **Clinician: check the demo patients' regimens and glucose traces for plausibility.** [ADR-0009](docs/adr/0009-diabetes-education-bot-synthetic-patients-glucose-data-and-insulin-regimens.md)
- [ ] **Course staff: does user testing with older adults need an IRB exempt determination?** Ask before recruiting anyone. [ADR-0005](docs/adr/0005-diabetes-education-bot-architecture-and-answer-path.md)

## To do

### Safety (before testers outside the team)

- [ ] **TD-7: catch dose advice written in words** ("take two units", "a few extra units", "a bit more insulin"). Priority high: with the monitor paused, the guard is the only check on model-written dose advice. Add a regression test with the three example sentences. [TECHNICAL-DEBT](docs/TECHNICAL-DEBT.md), `src/lib/chat/guard.ts`

### Conversation summary and nurse handoff (ADR-0008: decided, not built; on hold for the sponsor's reply, see Waiting)

Nothing in the app writes to `summaries` or `replies` today; the tables and their access rules exist (`db/migrations/0001`, `0002`) and are tested.

- [ ] **Follow-up questions:** 3 to 5, only about what the patient raised, one per screen, yes / no / skip buttons. Fields not asked are marked "not asked".
- [ ] **Structured summary:** fields with a value and the turn it came from; code checks each value against its cited turn; transcript attached; no free narrative.
- [ ] **End of conversation and sharing:** red-flag or high-touch conversations go to the care team automatically (patient told at the start); otherwise "Send to my care team" or "Just keep it for me".
- [ ] **Patient's copy:** generated from the fields by a template, with print / save as PDF, and "What happens next" (call for red flags, typed reply otherwise; urgent problems mean calling now).
- [ ] **Care-team inbox view:** replaces "Coming next" in `src/app/HomeScreen.vue`; shared summaries with their transcripts; says plainly that the nurse decides, not the bot.
- [ ] **Nurse replies:** typed in the inbox, shown to the patient next visit in large type, read aloud.
- [ ] **Turnaround wording** for the patient summary (when to expect a reply).

### Knowledge base

- [ ] **TD-5: stale section headings from the chunker** (list items and table cells taken as headings in the ADA guides). Then rebuild, review, and reload. [TECHNICAL-DEBT](docs/TECHNICAL-DEBT.md)
- [ ] **TD-6: the book chunks poorly** (page-break half-sentences and pull quotes read as headings). [TECHNICAL-DEBT](docs/TECHNICAL-DEBT.md)
- [ ] **Show the source date on chips** ("From ADA, retrieved {date}"); `kb/manifest.json` already has `snapshotDate`. [ADR-0005](docs/adr/0005-diabetes-education-bot-architecture-and-answer-path.md)

### Testing with users

- [ ] **Test protocol for moderated sessions:** tasks (nutrition question, high reading, dose question), what to observe, consent wording. [ADR-0010](docs/adr/0010-diabetes-education-bot-how-test-users-reach-it.md)
- [ ] **Public-site notice for strangers** that the link alone is a non-working preview. The sign-in screen already asks not to type real health information. [ADR-0010](docs/adr/0010-diabetes-education-bot-how-test-users-reach-it.md)

### Shared key (ADR-0014)

- [ ] **Redeploy `llm` to rls-dev**: it still runs the version without the `X-Title` fix, so browsers are blocked there. Kay (2026-11-17): "not now"; nobody tests on rls-dev yet. Do it before the next rls-dev test. [ADR-0014](docs/adr/0014-shared-openrouter-account-with-a-1-dollar-cap-per-tester.md)

### Housekeeping

- [ ] **TD-1: install Node 24 locally** to match CI, then bump jsdom. [TECHNICAL-DEBT](docs/TECHNICAL-DEBT.md)
- [ ] **Fix the stale comment in `src/lib/chat/retrieve.ts`** ("136 passages"; production has 472).

## In progress

- [ ] **Retrieval-only trial:** topic cards paused (`CARDS_PAUSED = true`) to see how raw-passage answers do on their own. [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)
- [ ] **Answer quality runs** with `npm run kb:eval-faq` (FAQ back in the knowledge base; other test questions via `--questions`). [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)

## Backlog

- [ ] **Multi-language support** (Kay, 2026-11-17). Not yet scoped: which languages, and whether testers write in them, read in them, or both. What it touches:
  - **Safety first:** the fixed triage rules (`src/lib/chat/triage.ts`), the dose-question patterns, and the small-talk list (`social.ts`) are English patterns. Today a non-English emergency relies on the classifier alone; the fixed rules, which are designed never to miss, don't see it.
  - **Knowledge base:** the FAQ, the ADA material and the book are English, and search matches English words. Either translated, approved sources, or a translated question searched against English and an answer translated back (which the guard would then have to check).
  - **Fixed text** (escalation, dose refusal, small talk, no-information) needs approved translations; the UI needs a language choice.
  - ADR written: [ADR-0017](docs/adr/0017-multi-language-support.md), three questions for Kay (a safety floor for non-English messages now; which languages; where translation happens). [ADR-0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md), [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md), [ADR-0016](docs/adr/0016-greetings-and-small-talk-in-a-cited-assistant.md)
- [ ] **Typo tolerance in search:** "I'm hungrym" finds nothing, while "I'm hungry" finds the FAQ answer (score 9.24). Older testers mistype. Options: fuzzy-match unknown words to the knowledge base's vocabulary, or say "I didn't find that. Could you check the spelling or ask another way?" when no word in the message is known. [ADR-0016](docs/adr/0016-greetings-and-small-talk-in-a-cited-assistant.md) iteration 4
- [ ] After an escalation, check in on the next turn ("Are you feeling better?"). [ADR-0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md)
- [ ] Caregiver wording for reports about someone else ("my wife won't wake up"). [ADR-0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md)
- [ ] Have a clinician confirm which ADA passages are used for the urgent cards (low treatment, "while you wait", DKA). [ADR-0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md)
- [ ] **The assistant reads the patient's saved dose regimen** (Kay, 2026-11-17), so it can answer questions like "when do I take my long-acting insulin?" from the record in the database. Today the regimen is only shown on screen and is never sent to a model (ADR-0005, ADR-0009). Needs an ADR first:
  - it reverses a safety rule: the answer model would see dose numbers, and the guard (rule 2) and TD-7 (dose advice written in words) become the only barrier between those numbers and a dosing instruction;
  - a read-back can act as dose advice if the record is stale (the card below);
  - a likely safer shape: code, not the model, answers regimen questions with a fixed template ("Your record says: … Check with your care team before changing anything."), the way escalation cards work. [ADR-0005](docs/adr/0005-diabetes-education-bot-architecture-and-answer-path.md), [ADR-0009](docs/adr/0009-diabetes-education-bot-synthetic-patients-glucose-data-and-insulin-regimens.md)
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
- [x] Answers read whole curated topic sections chosen by the classifier (the hike question now gets the exercise section). ADR-0018
- [x] Monitor back on after an offline measurement (0 blocks on 33 good answers; catches dose advice in words). ADR-0007
- [x] Non-English messages always get help and an "English only" note (safety floor). ADR-0017
- [x] ADR-0008 marked Partially Implemented, so "Accepted" isn't read as "built". ADR-0008
- [x] Fixed replies for small talk ("hi", "thanks", "who are you"), and a no-information reply that says what the assistant can help with. ADR-0016
- [x] README rewritten to describe the current code base, including the shared-key proxy.
