<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0006: Diabetes education bot — urgent-situation triage and escalation

- **Date**: 2026-11-14
- **Iteration**: 6
- **Status**: Accepted
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Decided: a help button in plain HTML that works even if the app, network, or model fails. On every message, a local rules layer and a model classifier are OR-combined, the higher tier wins, and an error or timeout counts as "maybe urgent". The model can soften a rules hit but never clear it.

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

- US numbers: 911 and the nurse line. The nurse line is a configurable placeholder. *(The iteration-1 draft also proposed 988. Kay dropped it in iteration 4.)*
- Glucose is reported in mg/dL, but the parser also recognizes mmol/L.

**Confirm**: Kay. Should 988 be added to the escalation targets? The prompt says "distress" but names only the nurse line and 911. **Resolved in iteration 4: no, 988 is dropped.**

---

## Proposed design

### The always-reachable help path

- **Get help now** is a fixed-position control written in plain HTML in `index.html`, with `tel:` links, outside the Vue app. If the app crashes, the network drops, or OpenRouter is down, it is still on the page and still dials.
- One tap opens a panel with two large rows: **Call 911** and **Call the nurse line**. *(A 988 row was dropped in iteration 4.)* Each shows the number in large type, because desktop browsers can't dial.
- Saying "help" or "emergency" opens the panel through the local rules layer, with no model call.

### Triage on every message

| Layer | Runs | Catches | On failure |
|---|---|---|---|
| **Rules** (local, synchronous, tested in the gate) | first, instantly | a symptom list including misspellings and everyday phrasing ("feel funny", "can't think straight", "won't wake up", "can't keep anything down", "fruity breath", "breathing hard"); glucose numbers with units (<70, <54, >300, a "HI" meter reading; *thresholds superseded in iteration 5, see "Urgent criteria"*); ketones ("moderate", "large"); distress phrases | can't fail at runtime |
| **Model classifier** (pinned model and provider, temperature 0, JSON schema) | in parallel | paraphrase, indirect wording, reports about someone else ("my husband is acting strange"), garbled input | timeout (~4 s), error, or invalid JSON counts as "check-in" (see tiers), never as "none" |

The two are **OR-combined: the higher tier wins.** The one exception is QST-TRIAGE-ASKING-VS-HAVING, which lets the model *soften* a rules hit by one step, but never to "none".

### Tiers

- **EMERGENCY** (signs of severe hypoglycemia, DKA signs, unresponsiveness, chest pain, intent to self-harm): a full-screen card. 911 comes first and the nurse line second, plus the approved "while you wait" card, shown verbatim. The education answer is withheld.
- **URGENT** (hypo or hyper symptoms the user can act on, readings out of range): a banner with the nurse line, the approved action card (for example, the hypo-treatment card), and "If you feel worse or can't do this, call 911." The education answer follows below.
- **DISTRESS**: the nurse line, and 911 if the user may be in danger, with fixed, warm wording. *(988 dropped in iteration 4.)*
- **CHECK-IN**: the help buttons appear inline in the answer card: "If this is happening to you now: [Nurse line] [911]".
- **NONE**: the normal answer, with the help button still on screen.

### Dose-advice routing

Rules plus the classifier flag dose intent ("how many units", "should I take more", "skip my shot", "change my dose"). The router sends these to a fixed card: "I can't advise on insulin doses. Your care team can," with the nurse line. This routing happens before the agent loop starts. Since iteration 3, the model writes the answers (ADR-0005, constrained RAG), and the corpus keeps ADA passages that explain dose arithmetic (narrow boundary). So routing alone is no longer enough: a dose gate also checks every final answer after the loop ends (ADR-0005, QST-DIAB-DOSE-GUARD). *(Revised twice. Iteration 1 said verbatim answers guaranteed no dose advice. Iteration 2 added a corpus filter. Iteration 3 needs an output gate.)*

### Evaluation

- **Must-catch set**: synthetic first-person urgent messages. They include elderly phrasing, misspellings, simulated speech-to-text errors ("hippo" for "hypo", "die a beaties"), and reports about someone else. **Release criterion: 100% caught at URGENT or higher by rules plus the classifier combined.**
- **Must-not-alarm set**: ordinary education questions. Measure the false-positive rate and report it, but don't use it to block a release. It shows how much alarm fatigue the design costs.
- The rules-layer parts of both sets run in the gate (`vitest`). The combined eval runs against the live model separately.

---

## Questions

### QST-TRIAGE-LAYERS: How is urgency detected on each message?
- Status: answered
- Why asking: The bot must detect hypo- and hyperglycemia symptoms, DKA signs, and distress, and missed cases cost far more than false alarms. Each detector misses different things. Rules miss paraphrase. A model misses when it is down, slow, or wrong.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Rules only**: A local symptom list plus glucose-number parsing. Instant, works offline, fully testable in the gate. Misses indirect wording ("I'm just not right today") and novel misspellings.
- **B — Rules OR model, fail-closed**: Both run, and the higher tier wins. A model timeout or error counts as "check-in". Catches paraphrase, while the rules keep working with no network.
- **C — Model only**: One classifier call per message. Simplest to build and best at paraphrase. When the model is down, nothing is detected.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Rules OR model, fail-closed.** *Rationale*: Rules and the model fail independently: rules miss wording, the model misses on outages. With OR-combination, a miss requires both to miss, which is what "false negatives are far costlier" asks for. C can't meet that during an outage, and A can't meet it for wording we didn't anticipate. *Confidence*: 0.9 — because this follows directly from the stated cost asymmetry and Harness's dependence on the network. *If wrong*: if the combined false-positive rate in the must-not-alarm set is so high that test users ignore the banners, keep **B** but tighten the classifier's prompt. Don't drop a layer.

**ANS:** (by Kay)
b

---

### QST-TRIAGE-ASKING-VS-HAVING: What happens when a symptom word appears in a question *about* symptoms rather than a report of them?
- Status: answered
- Why asking: "What are the signs of low blood sugar?" and "I'm shaky and sweaty" contain the same words. The rules layer can't tell them apart. If every education question about symptoms triggers a 911 banner, older users will learn to ignore it, which is the failure we're trying to prevent. The constraint is that false negatives cost far more than false positives.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Always escalate**: Any rules hit shows its full tier, whatever the framing. Never misses, but alarms on most symptom-education questions.
- **B — Model may soften by one step, never to none**: If the classifier says "informational, not happening now", a rules hit drops one tier (URGENT becomes CHECK-IN, so the help buttons appear inline with the answer). EMERGENCY-tier phrases are never softened.
- **C — Model may override**: The classifier's judgment wins. Fewest false alarms, but a classifier mistake can hide a real emergency.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Soften by one step, never to none.** *Rationale*: Under B, the worst case of a classifier mistake is that an urgent user sees the nurse and 911 buttons inline instead of in a banner. That is still escalation, still one tap away, and the help button is on screen regardless. A buys almost no extra safety and costs credibility with exactly the users we need to trust the banner. C breaks the hard constraint. *Confidence*: 0.7 — because the right amount of softening is a judgment about how older users react to alarms, and I haven't seen data on that. *If wrong*: if test users miss inline CHECK-IN prompts while actually having symptoms, flip to **A**.

**ANS:** (by Kay)
b

---

### QST-TRIAGE-CGM: Should a stored CGM reading trigger escalation by itself?
- Status: answered
- Why asking: Kay specified that CGM data is read-back only, and the bot does not reason over it to personalize answers. But if the stored latest reading is 45 mg/dL and the user asks a casual question, staying silent looks wrong. A threshold check is reasoning over CGM data, even if only in the escalation direction. With synthetic, static data, the reading also has no real "now".
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — No, read-back only**: CGM data is shown on request, with its timestamp, and never fed into triage. Matches the spec as written.
- **B — Threshold on the latest reading, escalation only**: If the latest reading is under 54 or over 300 mg/dL and less than 30 minutes old, show URGENT. The reading can only raise the tier, never lower it. The spec changes to "CGM may trigger escalation, never personalize answers".

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — No, read-back only (for v1).** *Rationale*: With synthetic, static data, the "less than 30 minutes old" check is always false, or has to be faked, so B would show behavior the demo can't honestly back up. It also adds a regulatory concern (ADR-0005's real-PHI section, item 7). Record it as a known gap, not a silent omission. *Confidence*: 0.55 — because this is a real values question about what the bot owes a user whose data it holds, and that's Kay's call. *If wrong*: if the class demo includes a simulated live CGM feed, flip to **B**.

**ANS:** (by Kay)
a

---

### QST-TRIAGE-DEMO-DIAL: In the class demo, should "Call 911" actually dial 911?
- Status: answered
- Why asking: The help path uses `tel:` links. On a phone, a tester (or a grader trying the button) who taps "Call 911" during a demo places a real emergency call. Accidental 911 calls tie up dispatchers. The nurse line is a placeholder anyway.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Real numbers**: `tel:911` and `tel:988` as in production. The demo is faithful, but the risk of accidental calls is real.
- **B — Demo mode**: A build flag (on by default) shows the real numbers in large type, but tapping opens a "This is a demo — in a real emergency, dial 911" dialog instead of dialing. Production builds turn the flag off.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Demo mode.** *Rationale*: The demo needs to *show* the escalation path, not use it, and accidental emergency calls have a real cost. The flag keeps the production path written and testable. *Confidence*: 0.85 — because the downside of A is concrete and B costs very little. *If wrong*: if the evaluation requires testing on a real device with the real call flow, flip to **A** for that session only.

**ANS:** (by Kay)
b

---

### QST-TRIAGE-HIGH-THRESHOLD: At what glucose reading does a high number trigger escalation?
- Status: answered — override, not a letter: Kay answered in chat by pointing to the clinic's red-flag list (>350 for URGENT); recorded by Nibble
- Why asking: The bot's rules layer escalates glucose readings above 300 mg/dL (iteration 1). The team's FAQ in the knowledge base (ADR-0005, iteration 6) uses **250 mg/dL** as its "high blood sugar" point. It also lists when to seek care immediately: blood sugar that stays very high, vomiting, stomach pain, trouble breathing, confusion, or positive ketones. If triage and content use different numbers, a user who reports 270 gets the FAQ's high-sugar advice but no nurse-line banner. Missed escalations cost far more than false alarms.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Use the team's numbers**: A reading over 250 triggers URGENT: a banner, the team's high-sugar card, and the nurse line. A reading over 250 together with any of the FAQ's warning signs triggers EMERGENCY.
- **B — Two steps**: 250–300 triggers CHECK-IN (help buttons shown with the answer), and over 300 triggers URGENT. The FAQ's warning signs trigger EMERGENCY at any reading.
- **C — Keep 300**: As designed. The FAQ content appears when asked, but escalation starts at 300.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Use the team's numbers.** *Rationale*: The rules that trigger escalation should come from the same source as the content the bot shows, so they can't disagree. Since missed escalations cost more than false alarms, the lower threshold wins. The FAQ's own list of warning signs gives an EMERGENCY rule already written in the team's words. *Confidence*: 0.7 — because the clinical threshold is the team's call, and a clinician might choose a different number. *If wrong*: if test users between 250 and 300 see so many banners that they start ignoring them, flip to **B**.

**ANS:** (by Kay, 2026-11-14)
"We can use the first box to define 'urgent' requests." The first box is the RED FLAGS list in the clinic's call-triage workflow, and its high-glucose criterion is severe hyperglycemia above 350 mg/dL.

---

NOT: The answer sets URGENT at >350. It doesn't say what the 250–350 band gets. The **Urgent criteria** section below puts that band at CHECK-IN, showing the FAQ's high-sugar card, and Kay can override that.

### QST-TRIAGE-SEVERE-HYPO: What counts as "severe hypoglycemia", and what does an ordinary low get?
- Status: answered
- Why asking: Kay set URGENT to mean the clinic's red flags, and one of them is "severe hypoglycemia or more than 2 episodes in 48 hours". The workflow doesn't define "severe". ADA's levels are: level 1, under 70 mg/dL; level 2, under 54; level 3, a severe event in which the person needs someone else's help. The rules from iteration 1 put any reading under 70 at URGENT. Following the red-flag list strictly moves an ordinary low down to CHECK-IN. The user would still see the Rule of 15 card, but with the help buttons inline instead of a banner. Missed escalations cost far more than false alarms.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Severe means under 54, or needing help**: Levels 2 and 3 count as severe and trigger URGENT. Needing help *right now* (can't treat it alone, confused, can't swallow) triggers EMERGENCY. A single low of 54–69 gets CHECK-IN, with the Rule of 15 card shown first.
- **B — Severe means needing help only**: Only level 3 counts as severe (URGENT if it was reported after the fact, EMERGENCY if it's happening now). Every reading of 54–69, and below 54 if the user is handling it, gets CHECK-IN with the Rule of 15 card.
- **C — Every low is URGENT**: Keep iteration 1's rule. Any reading under 70 triggers URGENT, which is stricter than the clinic's list.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Severe means under 54, or needing help.** *Rationale*: A reading under 54 is the point at which ADA calls a low clinically significant, and for older users (slower to notice symptoms, more fall risk) a missed escalation costs more. A is the reading of an undefined term that is cautious without being alarmist. C goes back against Kay's explicit choice to use the clinic's list, and B could leave a user at 45 handling it alone with no banner. Either way, the Rule of 15 card is shown first. *Confidence*: 0.65 — because the clinic's own definition of "severe" is what should decide this, and the document doesn't give it. *If wrong*: if a clinician on the team says the clinic means level 3 only, flip to **B**.

**ANS:** (by Kay)
a, keep a log of this decision

---

### QST-TRIAGE-PROFILE-FLAGS: May the rules layer use facts in the stored profile to raise urgency?
- Status: answered
- Why asking: Three of the clinic's red flags are facts about the patient, not about the message: "history of DKA" (combined with high glucose), pregnancy, and insulin pump use (which makes "pump failure" possible). Users often won't mention these in a message. The synthetic profile already holds the insulin regimen, which is read back only and never shown to the model (ADR-0005). The question is whether deterministic code (not the model) may read a few profile flags, only to *raise* urgency.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Message only**: Triage sees only what the user says. "History of DKA" and pregnancy count only if the user mentions them in the conversation.
- **B — Profile flags, raise-only, code-only**: The synthetic profile gains `history_of_dka`, `pregnant`, and `uses_pump`. The rules layer (code, not the model) reads them. A high reading from a user with a DKA history triggers URGENT, any glucose concern from a pregnant user triggers URGENT, and pump words carry more weight for pump users. The flags can only raise the tier, and the model never sees them.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Profile flags, raise-only, code-only.** *Rationale*: These red flags depend on who is asking, and older users are the least likely to volunteer their history in a short message. Three yes/no facts, read by code that can only raise urgency, don't break the spirit of "read-back only": the model still never reasons over user data. This also differs from QST-TRIAGE-CGM (answered A), where the problem was a static synthetic reading posing as current. A history of DKA doesn't go out of date. *Confidence*: 0.6 — because it extends what the stored profile is used for, beyond what Kay originally specified. *If wrong*: if Kay wants the profile to stay strictly display-only, flip to **A**, and the bot asks "Have you ever had DKA?" when a reading is high.

**ANS:** (by Kay)
b

---

## Decision

On 2026-11-14 Kay answered all four questions, each as recommended:

- **QST-TRIAGE-LAYERS: B.** Rules OR model, fail-closed.
- **QST-TRIAGE-ASKING-VS-HAVING: B.** The model may soften a rules hit by one step, never to none. EMERGENCY phrases are never softened.
- **QST-TRIAGE-CGM: A.** CGM data is read-back only for v1. This is a known, recorded gap.
- **QST-TRIAGE-DEMO-DIAL: B.** Demo mode is on by default. The call buttons show the real numbers but open a "this is a demo" dialog instead of dialing.

The proposed design stands, with one placement fixed by ADR-0005's switch to an agent loop: triage runs on the user's message **before the loop starts**, not as a tool inside it. **988 has been dropped** (Kay, iteration 4). The help panel has two rows, 911 and the nurse line, and the DISTRESS tier uses them.

### Urgent criteria from the clinic's triage workflow (iteration 5)

Kay: "We can use the first box to define 'urgent' requests." The source is the clinic's call-triage workflow in the team folder. Its first decision box, **RED FLAGS**, sends a call to an attending for same-day advice. That's the clinic's equivalent of this bot's URGENT tier, where the nurse line is the same-day contact. The workflow's other boxes (high-touch criteria, visit scheduling, staff routing) are internal clinic operations. They stay out of this public repo, and out of the bot's answer corpus.

| Tier | Criteria |
|---|---|
| **EMERGENCY** (911 first) | Unchanged from iteration 1, and limited to danger *happening now*: can't be woken, a seizure, a low the person can't treat alone, DKA signs (vomiting or can't keep fluids down, trouble breathing, confusion, fruity breath), chest pain, intent to self-harm. A red flag combined with any of these also triggers EMERGENCY. |
| **URGENT** (nurse line, same day) = **the clinic's red flags** | Glucose above 350 mg/dL. High glucose with ketones, or with a history of DKA (from the message, or the profile flag `history_of_dka`: QST-TRIAGE-PROFILE-FLAGS: B). Severe hypoglycemia, meaning below 54 mg/dL or needing someone's help (QST-TRIAGE-SEVERE-HYPO: A), or more than 2 lows in 48 hours. Insulin pump failure (alarms, occlusion, "pump stopped", "site came out"), which weighs more for `uses_pump` users. Pregnancy (from the message, or `pregnant`). |
| **CHECK-IN** (help buttons inline, with the matching approved card) | 250–350 mg/dL, showing the team FAQ's high-sugar card. A single low of 54–69 mg/dL that the user is handling, showing the Rule of 15 card first. |

- **"More than 2 lows in 48 hours" comes from what the user says**, for example "third time I've gone low since yesterday". Matching on that is mostly the model classifier's job, with a rules pattern for counts. Stored CGM data could compute it exactly, but QST-TRIAGE-CGM was answered A (read-back only), so for now it isn't used. That's a known gap, recorded here.
- **The thresholds now come from three sources.** The FAQ says 250, the clinic says 350, and iteration 1 said 300. The table settles it: 350 is URGENT (Kay's answer), and 250–350 is CHECK-IN, so a user in that range still sees help and the FAQ card. The rules row in the triage table above is superseded by this table.

### Answers recorded in iteration 6

- **QST-TRIAGE-SEVERE-HYPO: A.** "Severe hypoglycemia" means below 54 mg/dL (ADA level 2) or needing someone else's help (level 3), and triggers URGENT. Needing help *right now* triggers EMERGENCY. A single low of 54–69 that the user is handling gets CHECK-IN, with the Rule of 15 card shown first. Kay asked for this decision to be logged. It's entry 1 in the log below.
- **QST-TRIAGE-PROFILE-FLAGS: B.** The synthetic profile gains three yes/no fields: `history_of_dka`, `pregnant`, and `uses_pump`. Only the rules layer reads them, and only to raise the urgency level. The model never sees them, and the regimen stays read-back only (ADR-0005).

### Clinical assumptions log

These are the triage judgments that **don't** come straight from a source document (the clinic's workflow, ADA material, or the team FAQ). Each was decided here to fill a gap. Each one needs a clinician on the team to confirm it before the bot is shown to real users, and each should be listed in the class write-up as a design assumption.

| # | Date | Decision | Why a source didn't settle it | Decided by | Confirmed by a clinician? |
|---|---|---|---|---|---|
| 1 | 2026-11-14 | "Severe hypoglycemia" = below 54 mg/dL, or needing someone else's help | The clinic's RED FLAGS box names it but doesn't define it. ADA's level 2 and 3 thresholds were used | Kay (QST-TRIAGE-SEVERE-HYPO: A), on Nibble's recommendation | Not yet |
| 2 | 2026-11-14 | A single low of 54–69 that the user is handling gets CHECK-IN, not URGENT | Follows from treating the red flags as the definition of URGENT. Iteration 1 had escalated every reading below 70 | Kay (same answer) | Not yet |
| 3 | 2026-11-14 | 250–350 mg/dL gets CHECK-IN | Kay set URGENT at >350. The FAQ treats 250 as high. Nothing said what the range in between gets | Nibble's reading. Kay didn't override it | Not yet |
| 4 | 2026-11-14 | Profile facts (DKA history, pregnancy, pump use) may raise urgency | The red flags depend on facts about the patient that users may not mention | Kay (QST-TRIAGE-PROFILE-FLAGS: B) | Not applicable (a design choice, not a clinical threshold) |

New entries go at the bottom of this table. Don't edit rows that are already there. If a decision changes, add a row that supersedes the earlier one.

---

## Trade-offs

- **Alarm fatigue vs recall.** We choose recall, and soften the presentation (tiers, inline CHECK-IN) instead of the detection.
- **Triage blocks the answer.** Every answer waits for the classifier, up to the timeout. The rules layer covers the most serious cases instantly.
- **Static help in `index.html` sits outside Vue's component model.** Small duplication (styles, the number config) in exchange for surviving a crash of the app.
- **Classifier recall is tied to a specific model.** Pin the model and provider, and re-run the must-catch eval whenever either changes.

---

## Open Follow-ups

- [ ] Urgent cards (hypo treatment, "while you wait", DKA) can come verbatim from ADA's own hypoglycemia and DKA pages (iteration 2). Someone still has to choose which passages, and check them for any dose content (QST-DIAB-DOSE-BOUNDARY).
- [ ] After an escalation, should the bot check in on the next turn ("Are you feeling better?")? A follow-up is good care, but it means keeping escalation state across turns.
- [ ] Reports about someone else ("my wife won't wake up") need wording for a caregiver, not the patient.

---

## Iterations

### Iteration 1 (2026-11-14)
- Trigger: Kay's architecture request (see ADR-0005)
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Triage, tiers, help path, and eval proposed. Four questions posed with recommendations.
- Outcome: Draft

### Iteration 2 (2026-11-14)
- Trigger: Kay: the knowledge base is ADA's entire education material (ADR-0005, iteration 2)
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: The dose-advice section no longer claims verbatim answers alone guarantee no dose advice, and now points to the corpus filter. Urgent cards are sourced from ADA.
- Outcome: Draft

### Iteration 3 (2026-11-14)
- Trigger: Kay answered all four questions (B, B, A, B), plus ADR-0005's switch to constrained RAG inside an agent loop
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision section added. Triage runs before the loop. The dose-advice section points to the output gate (ADR-0005, QST-DIAB-DOSE-GUARD).
- Outcome: Draft → Accepted

### Iteration 4 (2026-11-14)
- Trigger: Kay dropped 988 and shared the team's knowledge base (ADR-0005, iteration 6)
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: 988 removed from the help panel and the DISTRESS tier. QST-TRIAGE-HIGH-THRESHOLD opened, because the team's FAQ uses 250 mg/dL and these rules used 300. The urgent cards now have a source: the Rule of 15 (both ADA guides), glucagon (the type 1 guide), and the FAQ's high-sugar answer and warning signs.
- Outcome: Accepted (one question open)

### Iteration 5 (2026-11-14)
- Trigger: Kay added the clinic's call-triage workflow to the team folder: "We can use the first box to define 'urgent' requests."
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: URGENT is now defined as the clinic's RED FLAGS: >350, high glucose with ketones or a DKA history, severe or repeated lows, pump failure, and pregnancy. QST-TRIAGE-HIGH-THRESHOLD is recorded as answered by override, and 250–350 is mapped to CHECK-IN. Two questions opened: QST-TRIAGE-SEVERE-HYPO ("severe" isn't defined) and QST-TRIAGE-PROFILE-FLAGS (three red flags are facts about the patient). The clinic's internal routing and staff scripts are kept out of this public record.
- Outcome: Accepted (two questions open)

### Iteration 6 (2026-11-14)
- Trigger: Kay answered QST-TRIAGE-SEVERE-HYPO: A ("keep a log of this decision") and QST-TRIAGE-PROFILE-FLAGS: B.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: The urgent criteria table now uses both answers. The profile gains `history_of_dka`, `pregnant`, and `uses_pump`, read only by the rules code to raise urgency. A **Clinical assumptions log** was started, with four entries, each awaiting confirmation by a clinician.
- Outcome: Accepted (no questions open)

---

## Links

- Related ADRs: ADR-0005 (architecture and verbatim answer path), ADR-0001 (browser-only, so no server-side notification), ADR-0003 (round cap; this design doesn't use the agent loop on the safety path)
