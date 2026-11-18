# Kanban

The project's work at a glance, built from the ADRs, `docs/TECHNICAL-DEBT.md`, and what the code actually does (checked 2026-11-17). Each card names where its details live. Decisions stay in the ADRs; this board only tracks the work.

Columns: **Waiting** (blocked on a person's answer or material), **To do** (ready to start, highest priority first), **In progress**, **Backlog** (open ideas, not yet committed to), **Done**.

---

## Waiting

### On Kay

- [ ] **Send the clinical sponsor email.** Several cards below wait on its answers. It asks about:
  - book numbers, T2D fit, ADA precedence, medicine wording (for TD-7), the five handouts;
  - approval of ADR-0016's small-talk texts and review of ADR-0017's language design;
  - more after-exercise eating material.
  - Record the answers in ADR-0013, ADR-0016 and ADR-0017.

### On the clinical sponsor or others

- [ ] **Kay: what to build first from the sponsor's reply** (received 2026-11-17, recorded in ADR-0008 iteration 7). See "From the clinical sponsor" in To do. [ADR-0008](docs/adr/0008-diabetes-education-bot-intake-conversation-summary-and-nurse-handoff.md)
- [ ] **Clinical sponsor: the field list.** His reply says to "collect the information the clinic needs" but doesn't name the fields. Ask, for each scenario (insulin change, high, low, can't eat, new medicine, steroid change), what the nurse needs: for example the reading and when, symptoms, last dose taken, food intake, the medicine and its start date. The answers replace ADR-0008's placeholder field table. [ADR-0008](docs/adr/0008-diabetes-education-bot-intake-conversation-summary-and-nurse-handoff.md)
- [ ] **Clinical sponsor: material for his scenarios.** The knowledge base has almost nothing on steroids (1 book passage), new medicines that affect blood sugar (0), and sick days (1 ADA passage). Clinic handouts would fill these. [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)
- [ ] **TD-7: catch dose advice written in words in the guard** ("take two units", "a few extra units", "a bit more insulin"). Kay (2026-11-16): "do not do td-7 yet"; it waits on the sponsor's answer about medicine wording. Meanwhile the monitor catches these offline (ADR-0007 iteration 7: 12/12), but the guard, which runs on every answer, still sees only digits. When unblocked, add a regression test with the three example sentences. [TECHNICAL-DEBT](docs/TECHNICAL-DEBT.md), `src/lib/chat/guard.ts`
- [ ] **Translations (ADR-0017):** Spanish, Chinese (Simplified), Chinese (Traditional), Korean. Needs translators for the fixed texts, and the sponsor's review. The safety floor for non-English messages is already live. [ADR-0017](docs/adr/0017-multi-language-support.md)
- [ ] **Clinical sponsor: review and approve topic cards** (`npm run kb:cards:approve`). Cards are paused (`CARDS_PAUSED`), so this is needed only if cards come back. [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)
- [ ] **Clinical sponsor: more nutrition material.** 7 of the 13 FAQ questions are nutrition and the current sources answer them thinly. [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)
- [ ] **Clinician: check the demo patients' regimens and glucose traces for plausibility.** [ADR-0009](docs/adr/0009-diabetes-education-bot-synthetic-patients-glucose-data-and-insulin-regimens.md)
- [ ] **Course staff: does user testing with older adults need an IRB exempt determination?** Ask before testing with older adults. The current testers are classmates. [ADR-0005](docs/adr/0005-diabetes-education-bot-architecture-and-answer-path.md)

## To do

### From the clinical sponsor (2026-11-17; ADR-0008 iteration 7)

What he asked for, mapped to the work. Kay decides the order (see Waiting).

1. **Ask before routing.** A dose or insulin-change question starts an intake instead of ending the turn:
   - [ ] **Dose questions start an intake.** Keep the fixed refusal (the bot never says how much to take), then ask whether the sugar is high or low, then the clinic's fields, then route. Changes ADR-0005's rule 3 path and the "Follow-up questions" card below; needs the field list (Waiting). [ADR-0005](docs/adr/0005-diabetes-education-bot-architecture-and-answer-path.md), [ADR-0008](docs/adr/0008-diabetes-education-bot-intake-conversation-summary-and-nurse-handoff.md)
2. **Red flags prepare the clinic contact.**
   - [ ] **Call checklist:** when the bot says to call, it also shows the patient's answers as a short list to read out on the phone, next to the message for the care team. New; extends the "Patient's copy" card below. [ADR-0008](docs/adr/0008-diabetes-education-bot-intake-conversation-summary-and-nurse-handoff.md), [ADR-0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md)
3. **Reinforce the patient's own plan.** He endorses the Backlog idea of reading the saved regimen, provided only providers change it:
   - The bot reading the patient's plan back in chat: moved to **In progress** (ADR-0020).
   - [ ] **Provider-only plan edits:** a care-team screen to update a patient's plan, with who changed it and when. The database already blocks writes to `patients` through the API; this needs a new access rule for the care-team role. [ADR-0011](docs/adr/0011-database-schema-and-access-rules.md)
4. **Patient-specific regimens that change over time.**
   - [ ] **Clinician check of Robert's taper numbers** (invented): part of the demo-patient check in Waiting; Jorge is the natural reviewer. [ADR-0019](docs/adr/0019-patient-plans-the-long-term-regimen-plus-a-dated-special-plan-from-the-provider.md)
   - [ ] Later: more special plans (a sick-day plan for the "can't eat" scenario; a pump backup plan for George), when Kay wants them (ADR-0019 QST-PLAN-WHO options B and C).
5. **Common scenarios: high, low, can't eat, new medicines, steroid changes.**
   - [ ] **Triage and routing check for his scenarios:** add cases to `kb/routing-questions.txt` and the triage tests ("I started prednisone", "I can't keep food down", "my doctor added a new pill"). Highs and lows are already covered; the other three need knowledge-base material first (Waiting). [ADR-0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md), [ADR-0018](docs/adr/0018-retrieval-whole-curated-topic-sections-chosen-by-the-classifier.md)

### Testing with users (testers are in as of 2026-11-17)

- [ ] **Read the testers' first conversations** in `public.triage_events` and `public.messages`. Look for misroutes (`detail.topics`), guard blocks (`detail.guard`), monitor vetoes, and false alarms. [ADR-0018](docs/adr/0018-retrieval-whole-curated-topic-sections-chosen-by-the-classifier.md), [ADR-0007](docs/adr/0007-diabetes-education-bot-a-second-model-that-monitors-the-conversation.md)
- [ ] **Test protocol for moderated sessions:** tasks (nutrition question, high reading, dose question), what to observe, consent wording. [ADR-0010](docs/adr/0010-diabetes-education-bot-how-test-users-reach-it.md)
- [ ] **Public-site notice for strangers** that the link alone is a non-working preview. The sign-in screen already asks not to type real health information. [ADR-0010](docs/adr/0010-diabetes-education-bot-how-test-users-reach-it.md)

### Answer quality

- [ ] **Fix the known misroutes** from the routing test (`npm run kb:eval-routing -- --yes`, 34/38):
  - swimming → monitoring instead of activity;
  - glucagon varies between low_blood_sugar and medicines_devices;
  - "doctor's appointment" → daily_life instead of support;
  - follow-ups like "what about at night?" lose the earlier topic.
  - Add each fixed case to `kb/routing-questions.txt`. [ADR-0018](docs/adr/0018-retrieval-whole-curated-topic-sections-chosen-by-the-classifier.md)

### Conversation summary and nurse handoff (ADR-0008: decided, not built; the sponsor has replied and confirmed the direction; the field list is still pending, see Waiting)

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

### Test branch (rls-dev)

- [ ] **Redeploy `llm` to rls-dev**: it still runs the version without the `X-Title` fix, so browsers are blocked there. Kay (2026-11-17): "not now"; nobody tests on rls-dev yet. Do it before the next rls-dev test. [ADR-0014](docs/adr/0014-shared-openrouter-account-with-a-1-dollar-cap-per-tester.md)
- [ ] **Switch rls-dev's sign-in emails to Gmail SMTP**, as production was. Neon's shared sender stopped reaching Penn addresses. Do it before anyone signs in there. [ADR-0011](docs/adr/0011-database-schema-and-access-rules.md)

### Housekeeping

- [ ] **TD-1: install Node 24 locally** to match CI, then bump jsdom. [TECHNICAL-DEBT](docs/TECHNICAL-DEBT.md)

## In progress

(nothing)

## Backlog

- [ ] **Answers about high blood sugar are thin.** Rule 1 hides dose-tagged passages from the model, and much of the ADA material on highs is dose-tagged. Loosening that needs Kay and the sponsor. [ADR-0018](docs/adr/0018-retrieval-whole-curated-topic-sections-chosen-by-the-classifier.md), [ADR-0005](docs/adr/0005-diabetes-education-bot-architecture-and-answer-path.md)
- [ ] **Typo tolerance in search:** "I'm hungrym" finds nothing, while "I'm hungry" finds the FAQ answer (score 9.24). Older testers mistype. Topic routing (ADR-0018) now covers many typos, because the classifier reads them; search is the fallback. Options: fuzzy-match unknown words to the knowledge base's vocabulary, or say "I didn't find that. Could you check the spelling or ask another way?" when no word in the message is known. [ADR-0016](docs/adr/0016-greetings-and-small-talk-in-a-cited-assistant.md) iteration 4
- [ ] **Bring topic cards back, or retire them.** Paused since 2026-11-16 (`CARDS_PAUSED`). The card code and pipeline stay in place. If approved cards cover the common questions, does the answer model still earn its place for them? [ADR-0013](docs/adr/0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md)
- [ ] After an escalation, check in on the next turn ("Are you feeling better?"). [ADR-0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md)
- [ ] Caregiver wording for reports about someone else ("my wife won't wake up"). [ADR-0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md)
- [ ] Have a clinician confirm which ADA passages are used for the urgent cards (low treatment, "while you wait", DKA). [ADR-0006](docs/adr/0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md)
- [ ] Revisit QST-TRIAGE-CGM now that readings are re-anchored to load time. [ADR-0009](docs/adr/0009-diabetes-education-bot-synthetic-patients-glucose-data-and-insulin-regimens.md)
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
- [x] Retrieval-only trial (cards paused, 2026-11-16) and answer-quality runs with `npm run kb:eval-faq`; led to ADR-0018. ADR-0013
- [x] Models chosen under the $15 budget, with a running cost total. ADR-0012
- [x] QST-KEY-SHARING answered (C: a Neon Function holding the shared key). ADR-0014
- [x] Model proxy `llm` built and deployed to rls-dev and production: sign-in and membership check, model allow-list, $1 cap per tester (admin metered, not capped), cost recorded in `llm_spend` (migration 0004). ADR-0014
- [x] Chat shows "N% of your test allowance" instead of dollars; no key form for testers. ADR-0014
- [x] Proxy CORS preflight fixed (`X-Title` allowed), with a regression test. ADR-0014
- [x] Signed-in call verified live: allowance line, answers, cost rows in `llm_spend`. ADR-0014
- [x] Project renamed to DIAlogue; site moved to `kayc26.github.io/dialogue/`. ADR-0015
- [x] Fixed replies for small talk ("hi", "thanks", "who are you"), and a no-information reply that says what the assistant can help with. ADR-0016
- [x] Non-English messages always get help and an "English only" note (safety floor); languages chosen. ADR-0017
- [x] Answers read whole curated topic sections chosen by the classifier (the hike question now gets the exercise section). ADR-0018
- [x] Lessons from the prototype: a routing test (34/38), unwell without a reading → both lows and highs, no examples from the model's own knowledge, the patient's own plan first. ADR-0018
- [x] The assistant may ask one short clarifying question, uncited and checked by the guard. ADR-0018
- [x] Answers no longer end with "your care team can help" unless the question is about doses, medicines, or a personal plan. ADR-0013
- [x] Monitor back on after an offline measurement (0 blocks on 33 good answers; catches dose advice in words). ADR-0007
- [x] Monitor no longer reads carbohydrate amounts as doses (the 15-15 rule, snack grams); verified live. ADR-0007
- [x] First four testers added as `patient_tester` ($1 cap each); sign-in emails moved to Gmail SMTP after Neon's shared sender stopped reaching Penn. ADR-0011
- [x] Patient plans: a long-term regimen plus a dated special plan from the provider; Robert's prednisone taper shown on his screen with today's step marked (code, not a model); live on production 2026-11-18. ADR-0019
- [x] The bot reads the patient's plan back in chat: written by code, shown only for a plan question with no reading, symptom, change word or red flag; the plan never reaches a model. Live classifier test: 0 plans shown wrongly in two runs. ADR-0020
- [x] Clinical sponsor's account added as `admin` (both views; metered, not capped). ADR-0011
- [x] Kay's calls: `kayc26/diabetes_chatbot` stays public (ADR-0018); a non-English greeting keeps the full help alert (ADR-0017).
- [x] ADR-0008 marked Partially Implemented, so "Accepted" isn't read as "built". ADR-0008
- [x] README rewritten to describe the current code base, including the shared-key proxy.
- [x] Repo cleanup: superseded handoff and the template's citation, changelog and quick start removed; handoff refreshed.
