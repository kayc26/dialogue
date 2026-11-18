<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# Patient plans: the long-term regimen plus a dated special plan from the provider

- **Date**: 2026-11-17
- **Iteration**: 2
- **Status**: Partially Implemented
- **Deciders**: Kay; input from the clinical sponsor

**TL;DR**: A demo patient's record holds two plans: the long-term regimen (as today) and a **special plan** from the provider with dated steps, such as insulin changes during a steroid taper. The data and the patient's screen come first; whether the bot reads it is a separate decision.

---

## Originating Context

**Source**:
- The clinical sponsor's reply (ADR-0008, iteration 7): "Handle patient-specific regimens, especially insulin instructions that change during a steroid taper. The bot could retrieve a provider-updated treatment plan; only providers should change the stored dosing information."
- Kay, 2026-11-17: "i think jorge is saying the steroid and taper affected regime should be recorded in the patient data, instead of generic answer from education material right? can we make up some in patient data ie have a field for long-term regime and a special case"

**Agency Grant**: Propose the shape and the demo content; Kay decides.

---

## Explicitation

**What I understand**:

1. **A taper plan is specific to each patient and dated.** Education material can explain why steroids raise blood sugar. It can never say "your insulin this week", which depends on the steroid dose, the patient's insulin, and the day of the taper. Only the provider can write that, so it belongs in the record.
2. **Two kinds of plan.** The **long-term regimen** (`patients.regimen`, today a fixed snapshot summarized from the ShanghaiT1DM/T2DM dose records, ADR-0009), and a **special plan** that holds for a period and then ends (a steroid taper; later perhaps sick-day rules or a pump backup plan).
3. **Robert (demo) is the natural first case.** He's 66 with type 2, on premixed insulin aspart 70/30 (about 12 units, morning and evening, per the dataset), and his story already has a fictional steroid start 5 days ago (`days_since_steroid_start: 5`, HIGH-TOUCH flag). His record has no plan for it.

**Background: steroids and tapers** (explained to Kay, 2026-11-17; kept here so the reason for this ADR survives):

- **What they are.** In the sponsor's reply, "steroids" means **corticosteroids**: anti-inflammatory medicines such as prednisone, dexamethasone and methylprednisolone (Medrol). They're not the muscle-building steroids athletes misuse. They're used for flare-ups of asthma or COPD, arthritis, autoimmune diseases, some cancer treatments, after some surgeries, and sometimes in serious infections. Older adults get them often, usually as a short course.
- **Why they matter for diabetes.** They **raise blood sugar**, sometimes a lot, even when diabetes is usually well controlled: the body resists insulin and the liver releases more sugar. The effect follows the dose. With a morning prednisone dose, the rise usually peaks in the afternoon and evening.
- **What a taper is.** A course is usually stepped down over days or weeks rather than stopped at once, because stopping suddenly can be dangerous. So the insulin side changes too:
  1. When the steroid starts, the patient may need **more insulin**.
  2. As the steroid dose steps down, the patient needs **less insulin**, often on a schedule the provider writes out.
  3. If the patient keeps taking the higher insulin dose after the steroid drops, they can go **low**.
- **Why this belongs in the patient record, not the knowledge base.** The right insulin dose depends on which day of the taper the patient is on and on their own insulin. That's patient-specific and provider-written, and it's exactly the dose arithmetic the bot must never do. Education material can explain *why* steroids raise sugar. Only the provider's plan can say what to take this week. Hence the sponsor's "only providers should change the stored dosing information", and Kay's reading of it: the taper plan is recorded in the patient data.
- **Already in the clinic's flowchart.** A new steroid start is a HIGH-TOUCH criterion (ADR-0006, ADR-0009), which is why Robert (demo) has `days_since_steroid_start`.
- **Knowledge-base gap.** The current sources barely cover steroids (1 book passage, 0 from ADA or the FAQ). General steroid education needs sponsor material (KANBAN Waiting).

**Assumptions**:

- **The plan content is invented** for testing, labeled as fictional, and goes on the existing Waiting item for a clinician to check the demo patients' regimens (ADR-0009). This ADR doesn't claim the numbers are clinically right.
- **No model reads the plan in this ADR.** Like the regimen today, it's shown on screen and never sent to a model (ADR-0005, rule 1). Reading it back in chat is the KANBAN item "ADR: the bot reads the patient's treatment plan".
- **No provider-edit screen yet.** Plans are loaded from the fixtures (`patients/load.ts`), as now. Provider-only edits are a separate KANBAN item.

**Confirm**: Kay.

---

## Questions

### QST-PLAN-STORE: Where does the special plan live?
- Status: answered
- Why asking: The long-term regimen is a JSON column on `patients`, loaded from the fixtures and readable by members, with no writes through the API (ADR-0011). The special plan could sit inside that JSON, or in a new table of dated plans. The sponsor wants only providers to change plans, which will later need a write rule for the care-team role.
- Need: pick a letter (or override; any shape answers)

Options:
- **A — Inside the regimen JSON**: `patients.regimen.special_plan`, with the reason, start and end, the steps, who set it and when. No database migration; the loader and patient screen change, nothing else. Moving it to a table later means a migration then.
- **B — A new `care_plans` table**: one row per plan (patient, kind, reason, start, end, steps, set by, set at), with read access for members and no API writes. Needs migration 0005, the access tests on rls-dev, and then production. A history of plan changes and provider edits later fit naturally.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — Inside the regimen JSON.** *Rationale*: Kay asked for "a field for long-term regime and a special case", and A gives exactly that today with no production migration. The access tests (`npm run test:db`) also need credentials that aren't in `.env.local` yet (handoff, 2026-11-16). The shape is written so it lifts into a table unchanged when provider edits are built. *Confidence*: 0.7 — because the only thing B buys now is a home for edits that aren't decided yet. *If wrong*: if Kay wants the provider-edit screen soon, or the sponsor wants a history of plan changes, this flips to **B**.

**ANS:** (by Kay)
a

---

### QST-PLAN-DATES: How are the plan's dates stored?
- Status: answered
- Why asking: Demo glucose readings are re-anchored so the last one falls at load time (ADR-0009). A taper with fixed calendar dates would be over within two weeks, after which every tester sees a finished plan.
- Need: pick a letter

Options:
- **A — Days from the steroid start, anchored at load**: steps are stored as day ranges ("days 1–5"), and the screen works out today's step from `days_since_steroid_start`. Robert is always partway through his taper.
- **B — Calendar dates**: steps carry real dates written at load time. More like a real record, but the demo goes stale unless it's reloaded.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — Days from the start, anchored at load.** *Rationale*: it matches how the readings already work, and Robert's "day 6" stays day 6 whenever a tester opens him. The screen can still show real dates by counting from today. *Confidence*: 0.8 — because the alternative only adds a reload chore. *If wrong*: if the sponsor wants plans that look exactly like a printed provider note with dates, this flips to **B**, with a reload before each test session.

**ANS:** (by Kay)
a

---

### QST-PLAN-WHO: Which demo patients get a special plan now?
- Status: answered
- Why asking: Kay asked for "a special case". The sponsor named steroid changes and "inability to eat" among the common scenarios. Every invented plan adds numbers a clinician has to check.
- Need: pick a letter

Options:
- **A — Robert only, a steroid taper**: prednisone stepping down over 14 days, with his morning insulin dose stepping back to usual alongside it (draft content below).
- **B — Robert, plus a sick-day plan for one more patient**: for example Helen's "if you can't eat" instructions from her care team, covering the sponsor's inability-to-eat scenario too.
- **C — Robert, plus a pump backup plan for George**: what to inject if the pump fails (his story already includes a pump failure).

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — Robert only.** *Rationale*: it's the case the sponsor named, it fits a story that already exists, and it keeps the invented numbers to one plan until the clinician check (KANBAN Waiting) has happened. The shape takes more plan kinds without change. *Confidence*: 0.65 — because B is close: inability to eat was also on the sponsor's list. *If wrong*: if Kay wants the sponsor's testers to see the can't-eat scenario soon, this flips to **B**.

**ANS:** (by Kay)
a

---

### QST-PLAN-SHOW: Does the patient screen show the special plan?
- Status: answered
- Why asking: The patient screen shows the regimen as read-only lines today (`src/app/PatientView.vue`). A special plan is most useful when it's clear which step applies today.
- Need: pick a letter

Options:
- **A — Shown, with today's step highlighted**: a "Special plan from your care team" box above the usual regimen: the reason, who set it and when, every step, today's step marked ("Today: day 6 of 14"), and "Afterwards: back to your usual plan". Labeled as demo content.
- **B — Stored only**: data in the record, nothing on screen until the bot-reads-the-plan ADR is decided.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — Shown, with today's step highlighted.** *Rationale*: it's what a patient on a taper needs to see, it uses the existing read-only path (no model involved), and testers and the sponsor can react to it before we decide anything about chat. *Confidence*: 0.8 — because showing a provider's plan word for word is how the regimen already works. *If wrong*: if the sponsor says patients shouldn't see a plan step without a nurse confirming it first, this flips to **B**.

**ANS:** (by Kay)
a

---

## Supporting Materials

### COD: special-plan shape (draft, for Robert)

Invented for testing. A clinician checks it (KANBAN Waiting, ADR-0009). Robert's usual dose of 12 units of 70/30, morning and evening, comes from his dataset summary. The morning dose goes up during the higher steroid doses because a morning prednisone dose mostly raises afternoon and evening sugar, which the morning premixed dose covers.

```json
"special_plan": {
  "kind": "steroid_taper",
  "reason": "Prednisone for a COPD flare",
  "set_by": "Your care team (demo)",
  "set_on_day": 0,
  "steps": [
    { "days": [1, 5],   "steroid": "prednisone 40 mg each morning", "insulin": "70/30: 18 units before breakfast, 12 units before dinner" },
    { "days": [6, 8],   "steroid": "prednisone 30 mg each morning", "insulin": "70/30: 16 units before breakfast, 12 units before dinner" },
    { "days": [9, 11],  "steroid": "prednisone 20 mg each morning", "insulin": "70/30: 14 units before breakfast, 12 units before dinner" },
    { "days": [12, 14], "steroid": "prednisone 10 mg each morning", "insulin": "70/30: 12 units before breakfast, 12 units before dinner (your usual)" }
  ],
  "after": "Stop prednisone after day 14. Keep taking your usual insulin.",
  "check": "Check your sugar before meals and at bedtime while you take prednisone. Call the clinic if it is below 70, or above 300 twice in a row.",
  "demo_note": "Made up for testing. Not clinical guidance."
}
```

### FIL: what changes
- `patients/personas.json`, `patients/build.py` (or the fixture directly): Robert's `special_plan`.
- `patients/load.ts`: carries it into `patients.regimen` (option A).
- `src/lib/...` `regimenLines` and `src/app/PatientView.vue`: the special-plan box and today's step (option A of QST-PLAN-SHOW), with tests for the day arithmetic (day 5 → step 1, day 6 → step 2, past day 14 → "finished").
- Loading the fixtures into production is a production write: ask Kay first.

---

## Decision

Kay answered A to all four (2026-11-17), as recommended:

- **QST-PLAN-STORE: A.** The special plan lives in `patients.regimen.special_plan`. No migration.
- **QST-PLAN-DATES: A.** Steps are day ranges counted from the start; `started_days_ago` is fixed at load (Robert: 5, matching `clinic_history.days_since_steroid_start`), so today is always day 6.
- **QST-PLAN-WHO: A.** Robert only: the prednisone taper drafted below.
- **QST-PLAN-SHOW: A.** Shown on the patient screen, today's step marked.

**What was built** (iteration 2):
- `patients/personas.json`: Robert's `special_plan`. `patients/build.py` copies it into `regimen.special_plan`, so a rebuild keeps it. `patients/fixtures/demo-robert.json` was edited to match (the dataset isn't needed for that), and a test keeps the two copies equal.
- `src/lib/patients/readback.ts`: `specialPlanView` marks today's step with code, never a model. A plan it can't place safely (malformed day ranges) shows nothing rather than a guess.
- `src/app/PatientView.vue`: "Special plan from your care team" at the top of **My insulin**, with today's step highlighted; "Prednisone taper: day 6 of 14" in the patient bar; a "Special plan" badge in the picker.
- The plan text is written as a record, like the regimen read-back ("Prednisone 30 mg each morning. Insulin aspart 70/30: 16 units before breakfast…"), with "Made up for testing. Not clinical guidance."
- The chat still never receives the regimen (ADR-0005, rule 1).
- Tests: 8 new (304 total): Robert's day 6, the step boundaries (days 1, 5, 6, 14), the finished state, the fixture matching the persona, and "no plan" or a malformed plan showing nothing.

**Loading into production.** `npm run patients:load` deletes and reloads every demo patient, which would clash with stored sessions once testers have used the app. A single `UPDATE` of Robert's `regimen` is the narrower write. Kay approves it before it runs.

---

## Open Follow-ups

- [ ] The bot reading the plan in chat ("what's my insulin today?"): KANBAN To do, "ADR: the bot reads the patient's treatment plan". This ADR's data is what it would read.
- [ ] Provider-only edits: KANBAN To do. Under QST-PLAN-STORE A, this is when the plan moves to its own table.
- [ ] Clinician check of the invented plan (KANBAN Waiting, ADR-0009).

---

## Iterations

### Iteration 1 (2026-11-17)
- Trigger: the sponsor's reply (ADR-0008, iteration 7) and Kay's request for "a field for long-term regime and a special case".
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: initial draft; four questions with recommendations; a draft taper for Robert.
- Outcome: Draft

### Iteration 2 (2026-11-17)
- Trigger: Kay: "answered" (A, A, A, A).
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: built as described in the Decision: Robert's plan in the persona and fixture, `specialPlanView` with 8 tests, the patient-screen box. Gate green (304 tests).
- Outcome: Draft → Partially Implemented. Live 2026-11-18 02:48 UTC with Kay's OK: one `UPDATE` of `demo-robert`'s regimen on production (insulins kept, `started_days_ago` 5 = clinic history), and the deploy. The plan exists only in the demo data; the chat doesn't read it yet (the regimen-reading ADR on the KANBAN).

---

## Glossary

- **Corticosteroid ("steroid")**: an anti-inflammatory medicine such as prednisone. It raises blood sugar in proportion to its dose.
- **Taper**: stepping a steroid dose down over days or weeks instead of stopping at once. The insulin plan steps down alongside it.
- **Long-term regimen**: the patient's usual insulin or medicines (`patients.regimen`).
- **Special plan**: a provider-written plan with dated steps that holds for a period and then ends (here, a steroid taper).
- **Card / item**: in this project's documents, a **card** is a reply the app shows on screen (an escalation card, the dose refusal card, a topic card), and an **item** is a to-do line on `KANBAN.md`.

---

## Links

- Related ADRs: [ADR-0005](0005-diabetes-education-bot-architecture-and-answer-path.md) (rule 1: regimen never sent to a model), [ADR-0008](0008-diabetes-education-bot-intake-conversation-summary-and-nurse-handoff.md) (sponsor's reply, iteration 7), [ADR-0009](0009-diabetes-education-bot-synthetic-patients-glucose-data-and-insulin-regimens.md) (demo patients, re-anchoring), [ADR-0011](0011-database-schema-and-access-rules.md) (access rules)
- Related code: `patients/`, `src/app/PatientView.vue`
