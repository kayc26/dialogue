<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0006: Diabetes education bot — urgent-situation triage and escalation

- **Date**: 2026-11-14
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Proposed: a help button in plain HTML that works even if the app, network, or model fails. On every message, a local rules layer and a model classifier are OR-combined, the higher tier wins, and an error or timeout counts as "maybe urgent". The model can soften a rules hit but never clear it.

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-14). The full excerpt is in ADR-0005. The part that applies here:

> Detects urgent situations (hypo/hyperglycemia symptoms, DKA signs, distress) and escalates to a nurse hotline or 911. Hard constraints: the escalation path is always reachable regardless of classifier output, the bot never gives insulin dose adjustment advice, and false negatives are far costlier than false positives.

**Agency Grant**: Propose an architecture. No code yet.

---

## Explicitation

**What I understand**:

1. **"Always reachable regardless of classifier output" is a requirement about what the help path depends on, not just a UI requirement.** It must not depend on the classifier, the model, the network, or even the Vue app having mounted.
2. **"False negatives are far costlier" sets the direction of every tie-break.** Unsure, timed out, or contradictory signals all resolve upward. The cost we accept is false positives, and the risk with false positives is alarm fatigue: an older user who is told "call 911" for every question about symptoms will learn to ignore it.
3. **Hypoglycemia itself makes the bot harder to use.** Confusion, shaking, and slurred speech make typing and dictation unreliable just when it matters most. This is the strongest argument for a help path that doesn't go through the chat.
4. **No dose advice is mostly guaranteed by ADR-0005's verbatim answer path.** Here, the dose-intent detector only needs to *route* dose questions to a fixed refusal card.

**Assumptions**:

- US numbers: 911, plus 988 (Suicide & Crisis Lifeline) for distress. The nurse hotline is a configurable placeholder.
- Glucose is reported in mg/dL, but the parser also recognizes mmol/L.

**Confirm**: Kay. Should 988 be added to the escalation targets? The prompt says "distress" but names only the nurse line and 911.

---

## Proposed design

### The always-reachable help path

- **Get help now** is a fixed-position control written in plain HTML in `index.html`, with `tel:` links, outside the Vue app. If the app crashes, the network drops, or OpenRouter is down, it is still on the page and still dials.
- One tap opens a panel with three large rows: **Call 911**, **Call the nurse line**, and **Talk to someone (988)**. Each shows the number in large type, because desktop browsers can't dial.
- Saying "help" or "emergency" opens the panel through the local rules layer, with no model call.

### Triage on every message

| Layer | Runs | Catches | On failure |
|---|---|---|---|
| **Rules** (local, synchronous, tested in the gate) | first, instantly | a symptom list including misspellings and everyday phrasing ("feel funny", "can't think straight", "won't wake up", "can't keep anything down", "fruity breath", "breathing hard"); glucose numbers with units (<70, <54, >300, a "HI" meter reading); ketones ("moderate", "large"); distress phrases | can't fail at runtime |
| **Model classifier** (pinned model and provider, temperature 0, JSON schema) | in parallel | paraphrase, indirect wording, reports about someone else ("my husband is acting strange"), garbled input | timeout (~4 s), error, or invalid JSON counts as "check-in" (see tiers), never as "none" |

The two are **OR-combined: the higher tier wins.** The one exception is QST-TRIAGE-ASKING-VS-HAVING, which lets the model *soften* a rules hit by one step, but never to "none".

### Tiers

- **EMERGENCY** (signs of severe hypoglycemia, DKA signs, unresponsiveness, chest pain, intent to self-harm): a full-screen card. 911 comes first and the nurse line second, plus the approved "while you wait" card, shown verbatim. The education answer is withheld.
- **URGENT** (hypo or hyper symptoms the user can act on, readings out of range): a banner with the nurse line, the approved action card (for example, the hypo-treatment card), and "If you feel worse or can't do this, call 911." The education answer follows below.
- **DISTRESS**: 988 and the nurse line, with fixed, warm wording.
- **CHECK-IN**: the help buttons appear inline in the answer card: "If this is happening to you now: [Nurse line] [911]".
- **NONE**: the normal answer, with the help button still on screen.

### Dose-advice routing

Rules plus the classifier flag dose intent ("how many units", "should I take more", "skip my shot", "change my dose"). The router sends these to a fixed card: "I can't advise on insulin doses. Your care team can," with the nurse line. Because answers are verbatim (ADR-0005), no other path can produce dose advice.

### Evaluation

- **Must-catch set**: synthetic first-person urgent messages. They include elderly phrasing, misspellings, simulated speech-to-text errors ("hippo" for "hypo", "die a beaties"), and reports about someone else. **Release criterion: 100% caught at URGENT or higher by rules plus the classifier combined.**
- **Must-not-alarm set**: ordinary education questions. Measure the false-positive rate and report it, but don't use it to block a release. It shows how much alarm fatigue the design costs.
- The rules-layer parts of both sets run in the gate (`vitest`). The combined eval runs against the live model separately.

---

## Questions

### QST-TRIAGE-LAYERS: How is urgency detected on each message?
- Status: unanswered
- Why asking: The bot must detect hypo- and hyperglycemia symptoms, DKA signs, and distress, and missed cases cost far more than false alarms. Each detector misses different things. Rules miss paraphrase. A model misses when it is down, slow, or wrong.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Rules only**: A local symptom list plus glucose-number parsing. Instant, works offline, fully testable in the gate. Misses indirect wording ("I'm just not right today") and novel misspellings.
- **B — Rules OR model, fail-closed**: Both run, and the higher tier wins. A model timeout or error counts as "check-in". Catches paraphrase, while the rules keep working with no network.
- **C — Model only**: One classifier call per message. Simplest to build and best at paraphrase. When the model is down, nothing is detected.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Rules OR model, fail-closed.** *Rationale*: Rules and the model fail independently: rules miss wording, the model misses on outages. With OR-combination, a miss requires both to miss, which is what "false negatives are far costlier" asks for. C can't meet that during an outage, and A can't meet it for wording we didn't anticipate. *Confidence*: 0.9 — because this follows directly from the stated cost asymmetry and Harness's dependence on the network. *If wrong*: if the combined false-positive rate in the must-not-alarm set is so high that test users ignore the banners, keep **B** but tighten the classifier's prompt. Don't drop a layer.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-TRIAGE-ASKING-VS-HAVING: What happens when a symptom word appears in a question *about* symptoms rather than a report of them?
- Status: unanswered
- Why asking: "What are the signs of low blood sugar?" and "I'm shaky and sweaty" contain the same words. The rules layer can't tell them apart. If every education question about symptoms triggers a 911 banner, older users will learn to ignore it, which is the failure we're trying to prevent. The constraint is that false negatives cost far more than false positives.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Always escalate**: Any rules hit shows its full tier, whatever the framing. Never misses, but alarms on most symptom-education questions.
- **B — Model may soften by one step, never to none**: If the classifier says "informational, not happening now", a rules hit drops one tier (URGENT becomes CHECK-IN, so the help buttons appear inline with the answer). EMERGENCY-tier phrases are never softened.
- **C — Model may override**: The classifier's judgment wins. Fewest false alarms, but a classifier mistake can hide a real emergency.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Soften by one step, never to none.** *Rationale*: Under B, the worst case of a classifier mistake is that an urgent user sees the nurse and 911 buttons inline instead of in a banner. That is still escalation, still one tap away, and the help button is on screen regardless. A buys almost no extra safety and costs credibility with exactly the users we need to trust the banner. C breaks the hard constraint. *Confidence*: 0.7 — because the right amount of softening is a judgment about how older users react to alarms, and I haven't seen data on that. *If wrong*: if test users miss inline CHECK-IN prompts while actually having symptoms, flip to **A**.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-TRIAGE-CGM: Should a stored CGM reading trigger escalation by itself?
- Status: unanswered
- Why asking: Kay specified that CGM data is read-back only, and the bot does not reason over it to personalize answers. But if the stored latest reading is 45 mg/dL and the user asks a casual question, staying silent looks wrong. A threshold check is reasoning over CGM data, even if only in the escalation direction. With synthetic, static data, the reading also has no real "now".
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — No, read-back only**: CGM data is shown on request, with its timestamp, and never fed into triage. Matches the spec as written.
- **B — Threshold on the latest reading, escalation only**: If the latest reading is under 54 or over 300 mg/dL and less than 30 minutes old, show URGENT. The reading can only raise the tier, never lower it. The spec changes to "CGM may trigger escalation, never personalize answers".

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — No, read-back only (for v1).** *Rationale*: With synthetic, static data, the "less than 30 minutes old" check is always false, or has to be faked, so B would show behavior the demo can't honestly back up. It also adds a regulatory concern (ADR-0005's real-PHI section, item 7). Record it as a known gap, not a silent omission. *Confidence*: 0.55 — because this is a real values question about what the bot owes a user whose data it holds, and that's Kay's call. *If wrong*: if the class demo includes a simulated live CGM feed, flip to **B**.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-TRIAGE-DEMO-DIAL: In the class demo, should "Call 911" actually dial 911?
- Status: unanswered
- Why asking: The help path uses `tel:` links. On a phone, a tester (or a grader trying the button) who taps "Call 911" during a demo places a real emergency call. Accidental 911 calls tie up dispatchers. The nurse line is a placeholder anyway.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Real numbers**: `tel:911` and `tel:988` as in production. The demo is faithful, but the risk of accidental calls is real.
- **B — Demo mode**: A build flag (on by default) shows the real numbers in large type, but tapping opens a "This is a demo — in a real emergency, dial 911" dialog instead of dialing. Production builds turn the flag off.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Demo mode.** *Rationale*: The demo needs to *show* the escalation path, not use it, and accidental emergency calls have a real cost. The flag keeps the production path written and testable. *Confidence*: 0.85 — because the downside of A is concrete and B costs very little. *If wrong*: if the evaluation requires testing on a real device with the real call flow, flip to **A** for that session only.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Trade-offs

- **Alarm fatigue vs recall.** We choose recall, and soften the presentation (tiers, inline CHECK-IN) instead of the detection.
- **Triage blocks the answer.** Every answer waits for the classifier, up to the timeout. The rules layer covers the most serious cases instantly.
- **Static help in `index.html` sits outside Vue's component model.** Small duplication (styles, the number config) in exchange for surviving a crash of the app.
- **Classifier recall is tied to a specific model.** Pin the model and provider, and re-run the must-catch eval whenever either changes.

---

## Open Follow-ups

- [ ] Who writes and approves the urgent cards (hypo treatment, "while you wait", DKA)? This is the same content-approval question as in ADR-0005.
- [ ] After an escalation, should the bot check in on the next turn ("Are you feeling better?")? A follow-up is good care, but it means keeping escalation state across turns.
- [ ] Reports about someone else ("my wife won't wake up") need wording for a caregiver, not the patient.

---

## Iterations

### Iteration 1 (2026-11-14)
- Trigger: Kay's architecture request (see ADR-0005)
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Triage, tiers, help path, and eval proposed. Four questions posed with recommendations.
- Outcome: Draft

---

## Links

- Related ADRs: ADR-0005 (architecture and verbatim answer path), ADR-0001 (browser-only, so no server-side notification), ADR-0003 (round cap; this design doesn't use the agent loop on the safety path)
