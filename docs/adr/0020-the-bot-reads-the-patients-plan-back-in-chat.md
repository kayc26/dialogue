<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# The bot reads the patient's plan back in chat

- **Date**: 2026-11-17
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay; input from the clinical sponsor

**TL;DR**: When a patient asks what their plan says ("what's my insulin today?"), the app answers with the provider's plan word for word, today's step first, written by code and never by a model. Any question about changing a dose, or one with a reading or symptom, still gets the dose refusal.

---

## Originating Context

**Source**:
- The clinical sponsor's reply (ADR-0008, iteration 7): "Reinforce the patient's existing treatment plan, not invent dose changes. He wanted the bot to check what the patient is taking against the team's instructions." And: "The bot could retrieve a provider-updated treatment plan; only providers should change the stored dosing information."
- KANBAN (Backlog until 2026-11-17, then To do): "The assistant reads the patient's saved dose regimen", raised by Kay on 2026-11-17.
- ADR-0019: Robert (demo) now has a provider's dated special plan, a prednisone taper, shown on his screen with today's step marked.
- Kay, 2026-11-17: "why can't we work on it", then "yes" to writing this ADR.

**Agency Grant**: Lay out the options and recommend; Kay decides.

---

## Explicitation

**What I understand**:

1. **Today a plan question is refused.** "What's my dose today?" matches the fixed dose patterns (`\bwhat dose\b`, `how much … insulin` in `triage.ts`) and the classifier's `dose_intent`, so it gets the dose refusal card (ADR-0005, rule 3). The regimen never reaches a model (rule 1). A patient on a taper who asks what their plan says is told to ask the care team, even though the care team's answer is on file.
2. **Two kinds of question that look alike.**
   - *What does my plan say?* "When do I take my insulin?", "What's my dose today?", "Am I still on prednisone?" The answer is in the record, written by the provider.
   - *Should I change something?* "My sugar is 280, should I take more?", "I'm not eating, can I skip my insulin?" That's dose advice, which the bot never gives. The sponsor wants it to start an intake (the KANBAN "Dose questions start an intake" item), not this ADR.
3. **The record can be out of date.** A plan on file is what the provider set; the patient may have been told something newer by phone. Every read-back has to say so.
4. **The sponsor's "only providers change it"** fits the bot repeating the provider's words and adding nothing.

**Assumptions**:

- Demo data only (ADR-0009). The read-back wording goes to the sponsor for review, like the other fixed texts.
- The intake for dose-change questions is separate work (needs the sponsor's field list).

**Confirm**: Kay.

---

## Questions

### QST-READ-WHO: Who writes the answer to a plan question?
- Status: unanswered
- Why asking: This decides whether a model ever sees dose numbers. Rule 1 (ADR-0005) keeps the regimen away from every model today. The guard only catches dose advice written with digits (TD-7, on hold), so a model that has seen the plan could rephrase it into advice the guard misses; the monitor would be the only check.
- Need: pick a letter (or override; any shape answers)

Options:
- **A — Code, fixed template**: the app shows a plan card built by code from the record: "Your plan from your care team says: Today (day 6 of 14): Prednisone 30 mg each morning. Insulin aspart 70/30: 16 units before breakfast, 12 units before dinner." No model is called; rule 1 stays.
- **B — The model, with the plan in its context**: the answer model gets the plan and phrases a reply. More natural ("Yes, you're still on prednisone; it drops to 20 mg on day 9"), but rule 1 is reversed, and TD-7 and the monitor become the protection.
- **C — Code for numbers, model for the rest**: code shows the plan card; the model may answer around it but never sees the plan's numbers. More complex: two pieces must agree.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — Code, fixed template.** *Rationale*: it's how the escalation and dose refusal cards already work (ADR-0005, ADR-0006), it needs neither TD-7 nor the monitor to be safe, and it is literally "the provider's words, unchanged", which is what the sponsor asked for. The screen already renders the same plan with `specialPlanView` (ADR-0019), so the card reuses tested code. *Confidence*: 0.85 — because the cost of A is only that replies sound fixed, and testers already accept that from the other cards. *If wrong*: if testers or the sponsor find the fixed card too stiff for follow-ups like "when does it go down?", this flips to **C**, keeping numbers in code.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-READ-WHEN: How does the app tell a plan question from a dose-change question?
- Status: unanswered
- Why asking: Both kinds set today's dose flag. Getting this wrong in one direction refuses a fair question; in the other, it reads a plan back to someone whose situation has changed ("my sugar is 300, what's my dose?"), which could read as "take your usual dose anyway".
- Need: pick a letter

Options:
- **A — A new classifier field, plus fixed safety checks**: the classifier also returns `plan_question: true` when the person asks what their plan or schedule says. The plan card is shown only if **all** hold: `plan_question` is true; the message has no glucose number, no symptom and no change word (more, less, skip, stop, extra, change, adjust; the fixed rules check this, not the model); triage is `none`; and the patient has a plan on file. Otherwise the dose refusal, as today.
- **B — Fixed patterns only**: a list of phrasings ("my plan", "my schedule", "what's my insulin", "when do I take"), with the same exclusions. Predictable and free, but misses phrasings older adults use that aren't on the list.
- **C — Always show the plan alongside the refusal**: any dose question gets the refusal and, if a plan exists, the plan card under it. Simple, but shows "16 units before breakfast" right under "my sugar is 300, how much should I take?", which reads as an answer.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — Classifier field plus fixed checks.** *Rationale*: the classifier already reads meaning for tiers, dose intent and topics (ADR-0006, ADR-0018) and catches phrasings a list would miss, while the exclusions that matter for safety (a number, a symptom, a change word, any red flag) are fixed rules that can't be talked out of it. When in doubt it falls back to today's refusal, never to the plan. *Confidence*: 0.75 — because the exclusion list needs testing against real phrasings before it can be trusted (a test file like `kb/routing-questions.txt`). *If wrong*: if the routing-style test shows the classifier field misfiring on dose-change questions, this flips to **B**.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-READ-WHAT: What does the plan card show, and for whom?
- Status: unanswered
- Why asking: Only Robert has a provider's special plan. The other five patients have a regimen summarized from research dose records ("usually recorded around 8 p.m."), which is what they did, not what a provider prescribed. Presenting that as "your plan from your care team" would be untrue.
- Need: pick a letter

Options:
- **A — Special plans only; others pointed to their record**: a patient with a special plan gets today's step, the next change ("From day 9: …"), and "The full plan is under My insulin". A patient without one gets: "I can't read your plan out here. What's on file is under My insulin; your care team's latest instructions come first."
- **B — Special plans, plus the regimen lines for everyone else**: patients without a special plan get their recorded regimen lines in the card, labeled "as recorded", not "your plan".
- **C — The whole special plan every time**: all steps, today marked. Complete, but long for one chat bubble.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-17)

**A — Special plans only.** *Rationale*: the sponsor asked for the *provider's* plan to be reinforced, and only a special plan is provider-written. The recorded regimens are observations from a dataset (ADR-0009), and repeating them in chat as an answer to "what's my dose?" gives them an authority they don't have. Today's step plus the next change answers the question asked; the full plan is one tap away. *Confidence*: 0.7 — because B is reasonable if Kay sees the recorded regimen as the demo's stand-in for a plan. *If wrong*: if Kay or the sponsor want every demo patient's regimen treated as their plan on file, this flips to **B**.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Supporting Materials

### COD: draft plan card (Robert, day 6)

```
Your plan from your care team says:
Today (day 6 of 14): Prednisone 30 mg each morning. Insulin aspart 70/30: 16 units
before breakfast, 12 units before dinner.
From day 9: Prednisone 20 mg each morning. Insulin aspart 70/30: 14 units before
breakfast, 12 units before dinner.
The full plan is under "My insulin". If your care team has told you something
different since, follow what they said. If your sugar is out of range or you feel
unwell, call the clinic.
```

### FIL: where it would go
- `src/lib/chat/turn.ts`: step 3 (dose), where the plan card would be chosen before the refusal.
- `src/lib/chat/triage.ts`: the exclusions (glucose number, symptom, change word) as fixed rules.
- `src/lib/chat/prompts.ts`, `combine.ts`: the classifier's `plan_question` field.
- `src/lib/patients/readback.ts`: `specialPlanView` (ADR-0019), reused for the card.
- `src/app/ChatPanel.vue`, `persist.ts`: the `plan` card kind.
- `ChatPanel` gets the patient's regimen from `PatientView` (today it gets only the flags). The regimen goes to code, never into a model call.

---

## Decision

Pending Kay's answers.

---

## Open Follow-ups

- [ ] The sponsor reviews the card's wording, including "If your care team has told you something different since, follow what they said".
- [ ] Dose-change questions start an intake (KANBAN, from the sponsor). This ADR leaves them refused as today.
- [ ] A test file of plan questions and dose-change questions, run like the routing test, before the classifier field is trusted.

---

## Iterations

### Iteration 1 (2026-11-17)
- Trigger: Kay asked why the plan read-back couldn't be worked on, then "yes" to this ADR.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: initial draft; three questions with recommendations; a draft card.
- Outcome: Draft

---

## Links

- Related ADRs: [ADR-0005](0005-diabetes-education-bot-architecture-and-answer-path.md) (rules 1 and 3), [ADR-0006](0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md) (fixed cards), [ADR-0008](0008-diabetes-education-bot-intake-conversation-summary-and-nurse-handoff.md) (sponsor's reply, iteration 7), [ADR-0018](0018-retrieval-whole-curated-topic-sections-chosen-by-the-classifier.md) (the classifier's added fields), [ADR-0019](0019-patient-plans-the-long-term-regimen-plus-a-dated-special-plan-from-the-provider.md) (the special plan)
- Related: [TECHNICAL-DEBT TD-7](../TECHNICAL-DEBT.md) (needed only under QST-READ-WHO B)
