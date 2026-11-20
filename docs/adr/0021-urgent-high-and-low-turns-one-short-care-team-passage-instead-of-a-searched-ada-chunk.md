<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0021: Urgent high and low turns — one short care-team passage instead of a searched ADA chunk

- **Date**: 2026-11-19
- **Iteration**: 2
- **Status**: Implemented
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: "My blood sugar is high, what do I do?" shows a long word-for-word ADA chunk that explains what hyperglycemia (or DKA) *is*, and then a written answer. Decide what an urgent glucose turn shows instead.

---

## Originating Context

**Source**: Kay, 2026-11-19, testing the live site: "the bot is returning too much information when getting asked 'my blood sugar is high...' why returning the definition".

**Agency Grant**: Explain; recommend.

---

## Explicitation

**What happens today** (`turn.ts`, `urgentPassage`; ADR-0006): on an *urgent* turn the reply has three parts:
1. the help banner;
2. one passage shown word for word, picked by word search over passages tagged `urgent` (query: the message plus "high blood sugar ketones");
3. the model's written answer.

**Why that passage is a definition** (measured, `scripts/ephemeral/2026-11-19-urgent-passage-ranking.ts`, real build of 2026-11-16):

| Patient's type | Passage shown | What it is |
|---|---|---|
| type 2 | `ada-t2-guide-022` (1,062 characters) | A badly split chunk: "How can I prevent **low** blood glucose?" bullets, then "What is high blood glucose (hyperglycemia)?" |
| type 1, or none | `ada-t1-guide-027` (989 characters) | "Ketones and Diabetic Ketoacidosis": what ketones are and how DKA happens |

- `team-faqs-008`, the care team's own "What do I do when I have a high blood sugar (>250 mg/dL)?" (348 characters, all action: drink water, follow your provider's instructions, monitor, and when to seek care), ranks 2nd to 4th and is **never** shown. The "care-team FAQ first" priority (Kay, 2026-11-16) is applied to what the model reads, not to this word-for-word pick.
- The own-type boost (×1.43, ADR-0013) is what lifts the type 2 chunk to first place.
- The written answer below it repeats "when to call 911". On some turns it leads with *causes* (`team-faqs-009`, "Why is my blood sugar high?", is in the same topic section), which isn't what "what do I do" asks.

Seen live: Kay's sessions on 2026-11-18 and 2026-11-19 (Dorothy and Mei, both type 2).

**Assumption**: emergencies are unchanged. A 911-level message (vomiting with a high, large ketones) keeps its current path: no model call, banner and approved passage.

**Confirm**: Kay. Is the problem the definition, the length, or both?

---

## Questions

### QST-URGENT-REPLY: What should an urgent high or low reply show?
- Status: answered
- Why asking: On an urgent glucose turn (for example "my blood sugar is 400, what do I do"), DIAlogue shows the help banner, then a word-for-word ADA passage picked by word search, then the model's answer. Word search picks a long chunk that explains what hyperglycemia or DKA *is* (type 2 patients get one that starts with how to prevent *lows*), while the care team's own short "what do I do when I have a high blood sugar" answer (`team-faqs-008`) is never shown. Kay finds the reply too long and definitional.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Fixed care-team passage, no model answer**: Urgent high → banner + `team-faqs-008` word for word, and nothing else. Urgent low → banner + the approved Rule-of-15 passage. The reply is short, predictable, testable, and costs no model call. Follow-up questions ("why is it high?") still get written answers. Cost: no tailoring to details in the message (a number, a symptom).
- **B — Fixed care-team passage, plus the model's answer**: As A, but the written answer stays below it. It's tailored, but still two blocks that overlap ("when to seek help" twice).
- **C — Only the model's answer**: Drop the word-for-word passage on urgent turns. The answer is already guarded and cited, and the banner carries the help links. One block, but the safety step depends on the model each time.
- **D — Keep search, prefer the care team**: Same three parts, but the word-for-word pick prefers care-team passages, so `team-faqs-008` wins. Smallest code change; still three blocks.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-19)

**A — Fixed care-team passage, no model answer.** *Rationale*: It fixes both complaints at once: `team-faqs-008` is a third the length and is the action, not the definition. It also matches Kay's own "one question, one reply" rule (2026-11-14). The care team wrote that passage for exactly this question, so it is the best-sourced answer there is. A fixed choice also removes the search behavior that showed a "preventing lows" chunk to someone who is high, which no amount of score tuning makes impossible. Emergencies already work this way (no model call), so urgent glucose turns would follow a proven pattern. *Confidence*: 0.7 — because the ranking problem is measured, but whether testers miss the tailored answer is a judgment only live use will show. *If wrong*: if testers' follow-ups show they wanted their number or symptom addressed in the same reply (e.g. "it's 400 and I feel fine"), move to **B**. If Kay prefers no word-for-word text at all, **C**.

**ANS:** (by Kay)
the current message is fine, but without the definition of high and low blood sugar

---

## Decision

### Chosen (Kay, 2026-11-19): one message, written answer only, no definition

Kay's answer: "the current message is fine, but without the definition of high and low blood sugar". Kay then asked "why would the bot return two messages", which made "the current message" ambiguous (the reply bubble held two texts, the quoted passage and the written answer). Asked to choose, Kay picked:

- **Urgent reply: the written answer only.** An urgent turn shows the help notice and the written answer. The quoted "what to do" passage is held back, and shown only when no written answer is: a dose refusal, a blocked answer, "no information", or a monitor veto. In practice this is option **C**, with a safe fallback.
- **One alert box.** When the monitor raises the level, it replaces the reply's help notice instead of adding a second box.

**Also changed, so no reply quotes a definition**: emergencies call no model, so they always quote a passage (the 412-and-vomiting test quoted `ada-t2-guide-022`), and so do blocked urgent answers. The quoted passage now prefers the care team's own (`team-faqs-008` for highs), and is never one aimed at the opposite problem. Lows are unchanged: their candidates (`ada-t1-guide-016`, `ada-t2-guide-021`, the Rule of 15) define nothing.

**Code**:
- `src/lib/chat/turn.ts`: `urgentPassage` (care team first, direction-checked via `lean`, now exported from `retrieve.ts`); `settleUrgent` in `runTurn` (the held passage); `raiseEscalation` (one box).
- `src/app/ChatPanel.vue`: the background monitor's raise replaces the reply's box while that reply is still the newest message. Once the conversation has moved on, the raise is added at the bottom as before, so a late warning can't land out of sight. This exception is Nibble's, made for safety; overrule it if one box always matters more.

**Not changed**: the written answer itself can still mention thresholds (for example "usually below 70 mg/dL"), because it's written from the topic section. The low section still contains `ada-t2-guide-022` (follow-up below).

---

## Open Follow-ups

- [ ] `ada-t2-guide-022` mixes two unrelated sections (preventing lows; what a high is). That's a chunking fault in `kb/build.ts`, and it affects every answer that reads it, not just urgent turns. Worth splitting at the next knowledge-base rebuild (the topic-map check from ADR-0018 iteration 6 will flag the id change).
- [x] A regression test with "my blood sugar is high, what do i do" for a type 2 patient that fails on the old behavior. *(Done: `turn.test.ts`, Regression tests. Four tests fail on the old `turn.ts`.)*
- [ ] Monitor outages in a dose session are shown (check-in help) but not logged as such: `monitor_unavailable` goes on the card, not into `triage_events.criteria`. Found in the same tester review; small.

---

## Iterations

### Iteration 1 (2026-11-19)
- Trigger: Kay's report from the live site
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Cause measured (ranking script); QST-URGENT-REPLY posed with a recommendation
- Outcome: Draft

### Iteration 2 (2026-11-19)
- Trigger: Kay's answer ("the current message is fine, but without the definition"), Kay's question "why would the bot return two messages", and two follow-up choices in the question dialog ("Written answer only", "Replace, one box").
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision recorded as above; held urgent passage, care-team-first and direction-checked quote, one alert box. Tests: 6 new or rewritten (346 total); two existing tests updated to the new behavior (the urgent quote now appears only without a written answer).
- Outcome: Draft → Implemented

---

## Links

- Related ADRs: [ADR-0006](0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md) (triage and the urgent passage), [ADR-0013](0013-knowledge-base-shape-raw-passages-or-synthesized-topic-cards.md) (own-type boost, care-team priority), [ADR-0018](0018-retrieval-whole-curated-topic-sections-chosen-by-the-classifier.md) (topic sections)
- Code: `src/lib/chat/turn.ts` (`urgentPassage`, step 1 and the urgent branch after the classifier)
