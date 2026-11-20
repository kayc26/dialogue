<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0022: Ambiguous dose questions — offer the insulin on file after the refusal

- **Date**: 2026-11-19
- **Iteration**: 2
- **Status**: Implemented
- **Deciders**: Kay, Nibble (Claude Opus 5.5); the clinical sponsor to be informed (QST-DOSE-FOLLOWUP-WHEN)

**TL;DR**: "How much insulin should I take?" gets a dead-end refusal, even when the patient may just mean "what's on my plan". Decide whether the refusal offers a fixed follow-up that leads to the insulin on file, without a model and without dose advice.

---

## Originating Context

**Source**: Kay, live site, 2026-11-19, with a screenshot. "hwo much insulin should i take" got the dose refusal; "what's my insulin on file" then read the record back. Kay asked "why the first one didn't work", then "why doesn't the bot ask follow up question if not clear", then "you can make it adr directly".

**Agency Grant**: Recommend; Kay decides.

---

## Explicitation

**What happens today**:
1. A dose question gets the fixed refusal and **no model is called** (ADR-0005, rule 3), so nothing can ask a follow-up. The bot's only follow-up mechanism is the answer model's one clarifying question (ADR-0018 iteration 5), and dose questions never reach it.
2. ADR-0020 reads the plan back only for "what does my plan say" questions. "How much insulin should I take?" is blocked twice: the classifier marked it `dose_intent` and not `plan_question` (log, 2026-11-20 00:37 UTC), and "should I" is on the fixed advice list in `plan.ts`. ADR-0020's reason holds: a plan shown under "how much should I take?" reads as "take 5 units".
3. So a patient who meant "what's on my plan?" hits a dead end, with no hint that the record can be read back.

**The existing checks already separate the two meanings** (`planBlocker` in `src/lib/chat/plan.ts`, run on 2026-11-19):

| Message | Blocker | Meaning |
|---|---|---|
| "hwo much insulin should i take" | advice | ambiguous |
| "what dose should i take" | advice | ambiguous |
| "how much insulin do I take" | none | ambiguous |
| "my sugar is 300, how much should I take" | reading | a decision for today |
| "I feel shaky, how much insulin should I take" | symptom | a decision for today |
| "should I take more insulin" / "can I skip my insulin" | change | a decision for today |

**The proposal**: when the refusal is shown, the patient has insulin on file, triage is `none`, and the only blocker is "advice" (or none), the refusal gets a fixed follow-up, and the patient's tap decides. Messages with a reading, symptom, or change word never get the offer: those are the cases where showing the record reads as advice.

**Assumptions**:
- The refusal itself never changes ("I can't give advice about insulin or medicine doses…").
- A tap runs the existing read-back by code (`planReply`, ADR-0020): no classifier call and no model. The read-back keeps its heading ("Your insulin as recorded (not a plan from your care team)") and, for a special plan, its footer.
- This is a step toward the sponsor's intake ("Dose questions start an intake", ADR-0008, waiting on the field list), not a replacement. The intake would add questions after this one.

**Confirm**: Kay. Does "the tap decides" feel safe enough, given that the record then sits a few lines under the dose question?

---

## Questions

### QST-DOSE-FOLLOWUP: What should follow the dose refusal when the question may only be about the plan?
- Status: answered
- Why asking: "How much insulin should I take?" gets the fixed refusal and nothing else, because dose questions never reach a model, so nothing can ask a follow-up (ADR-0005 rule 3). Older patients may mean "what's on my plan?", and the app can read the insulin on file back by code (ADR-0020), but the refusal doesn't say so. The existing checks can tell the ambiguous wording ("should I take", "do I take") from a real decision for today (a reading, symptom, or change word), so a follow-up could be offered only in the ambiguous case.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Offer the record**: Under the refusal: "Did you want to see the insulin on file?" with a **[Show my insulin on file]** button. Tapping shows the read-back by code. Only for ambiguous wording, with insulin on file and no red flag. One tap; the smallest change.
- **B — Ask which one they meant**: Under the refusal: "Do you want to see what's on file, or are you deciding about a dose today?" with two buttons. **[What's on file]** shows the read-back. **[Deciding about a dose]** shows the nurse line now, and later the sponsor's intake ("is your sugar high or low?"). It names the intent outright and builds the intake's first step. One more tap, and a little more text.
- **C — Keep the plain refusal for now**: Change nothing until the sponsor's intake (ADR-0008) is specified. The patient can still ask "what's my insulin on file?" if they think of it.
- **D — Let the model ask**: Send ambiguous dose questions to the answer model so it can ask a clarifying question. This breaks rule 3 (no model ever handles a dose question). Listed so the exclusion is visible.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-19)

**A — Offer the record.** *Rationale*: It removes the dead end Kay hit with the least new surface: one fixed sentence and one button, both written in code. The safety line is the one ADR-0020 already drew: the offer appears only when `planBlocker` finds no reading, symptom, or change word (the table above). The read-back itself is unchanged, already labelled as a record, and no model sees the regimen. B is better if the sponsor wants the intent stated outright, and it would become the intake's first step, but it adds a branch whose second half (the intake) doesn't exist yet. C leaves testers at the dead end Kay found on day 3. D breaks the one rule every dose path keeps. *Confidence*: 0.65 — because the separation is measured on real phrasings, but whether a record a few lines under "how much should I take?" reads as an answer is a judgment the sponsor should check. *If wrong*: if the sponsor or testers read the offered record as dose advice, flip to **B** (intent first, record second). If the sponsor wants nothing before the intake, **C**.

**ANS:** (by Kay)
a

---

### QST-DOSE-FOLLOWUP-WHEN: Ship to testers now, or wait for the clinical sponsor?
- Status: answered
- Why asking: QST-DOSE-FOLLOWUP changes what follows a safety message (the dose refusal). Current testers are classmates using demo patients with invented regimens; the sponsor reviews clinical wording and owns the coming intake.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Ship now, tell the sponsor**: Build it, deploy it for the classmate testers, and send the sponsor a short note with the exact wording and the table above, asking for objections.
- **B — Sponsor first**: Write the change up for the sponsor and build after they reply. Slower; nothing reaches testers without clinical review.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-19)

**A — Ship now, tell the sponsor.** *Rationale*: The data is synthetic and the testers are classmates (KANBAN, Waiting: the IRB question for older adults is still open), the change adds no dose advice, and it can be switched off by one constant if the sponsor objects. *Confidence*: 0.7 — because the risk is low with demo data, but sign-off on clinical wording is the sponsor's, not mine. *If wrong*: if the sponsor has asked to see every change to safety messages before it ships, **B**.

**ANS:** (by Kay)
a

---

## Decision

### Chosen (Kay, 2026-11-19)

- **QST-DOSE-FOLLOWUP: A**: offer the record.
- **QST-DOSE-FOLLOWUP-WHEN: A**: ship now, and tell the sponsor.

**What a patient sees**: under the unchanged refusal, "Did you want to see the insulin on file?" and a **[Show my insulin on file]** button. Tapping it adds "Show my insulin on file" as their message and the read-back as the reply: the provider's special plan when one is in force, otherwise the insulin as recorded, with its headings as in ADR-0020.

**When the offer appears**: all of these must hold: the dose refusal is shown (`dose_intent`, dose rules on); triage is `none`; something is on file (`hasPlanOnFile`: a special plan in force, insulin, or pump settings); and `planBlocker` finds no reading, symptom, or change word (no blocker, or only "advice").

**Code**:
- `src/lib/chat/turn.ts`: step 3 sets `offerPlan` on the refusal card; `planOnRequest` builds the tap's turn by code, with no model call.
- `src/lib/chat/plan.ts`: `OFFER_PLAN_AFTER_REFUSAL`, the off switch.
- `src/lib/patients/readback.ts`: `hasPlanOnFile`.
- `src/app/ChatPanel.vue`: the button, and `showPlanOnFile`.
- `src/lib/chat/persist.ts`: the history text notes the offer, never the doses.

**Logged**: on the refusal turn, `detail.plan.offered: true`; on the tap, its own turn with `detail.plan.via: 'offer'`, criterion `plan_offer_tap`, source `rules` (no classifier ran).

### Consequences
- One existing test changed by design: "What's my insulin dose today?", when the classifier misses `plan_question`, now gets the refusal with the offer instead of a bare refusal.
- The read-back can now be reached with a tap as well as by wording, so the sponsor's view of ADR-0020's safety line matters more (action item below).

---

## Action Items

- [ ] Tell the clinical sponsor (QST-DOSE-FOLLOWUP-WHEN: A): the exact wording, the "when the offer appears" rule, and the phrasing table above, asking for objections. If the sponsor objects, set `OFFER_PLAN_AFTER_REFUSAL` to false. Owner: Kay

---

## Open Follow-ups

- [x] Whatever is chosen: a test that "my sugar is 300, how much should I take" never gets the offer, and that "how much insulin should I take" does (Robert, who has insulin on file). *(Done: `turn.test.ts`, plus a symptom, two change words, no insulin on file, and a check-in.)*
- [x] Log the offer and the tap (`triage_events.detail`), so it shows whether patients who ask "how much should I take" mostly wanted the record. *(Done: `plan.offered` and `plan.via`.)*
- [ ] After a week of testing, count offers against taps. Mostly ignored would suggest the wording was usually a real dose question (then consider B); mostly tapped would support keeping A.

---

## Iterations

### Iteration 1 (2026-11-19)
- Trigger: Kay's screenshot and two questions (why the refusal; why no follow-up question)
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Behavior explained from the log and `plan.ts`; `planBlocker` run on eight phrasings; two questions posed with recommendations
- Outcome: Draft

### Iteration 2 (2026-11-19)
- Trigger: Kay answered A and A.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Built as described in the Decision. Tests: 4 new, 1 updated by design (351 total). Not yet clicked through in a browser: the patient view needs a sign-in, so Kay checks it on the live site.
- Outcome: Draft → Implemented

---

## Links

- Related ADRs: [ADR-0005](0005-diabetes-education-bot-architecture-and-answer-path.md) (rule 3: dose questions get the fixed refusal), [ADR-0008](0008-diabetes-education-bot-intake-conversation-summary-and-nurse-handoff.md) (the sponsor's intake), [ADR-0018](0018-retrieval-whole-curated-topic-sections-chosen-by-the-classifier.md) (the model's clarifying question, iteration 5), [ADR-0020](0020-the-bot-reads-the-patients-plan-back-in-chat.md) (plan read-back and its fixed checks)
- Code: `src/lib/chat/plan.ts` (`planBlocker`), `src/lib/chat/turn.ts` (step 3, dose refusal), `src/app/ChatPanel.vue` (refusal card)
