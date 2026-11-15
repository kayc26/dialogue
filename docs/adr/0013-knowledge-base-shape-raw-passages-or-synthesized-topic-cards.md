<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0013: Knowledge base shape — raw passages or synthesized topic cards

- **Date**: 2026-11-14
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Open. The question: keep answering from 136 passages cut straight from the ADA documents, or add an offline step that groups the material by topic into plain-language "topic cards" a clinician approves. Recommended: C — cards for the common topics, with raw passages kept for everything else.

---

## Originating Context

**Source**: Kay, after the first live chats (2026-11-14), verbatim: "now i'm wondering if I should actually put all thouse material in there, or should there be a synthesize process at the back that group the ideas by topic from those education mateirals, etc"

What the first live test showed (details under Supporting Materials):

- Every retrieval misfire came from passages cut straight from the ADA documents. "How to lower my blood sugar" showed the Rule of 15 for *lows*, because a chunk carried a stale "After eating" heading (TD-5).
- The questions that went well matched the care-team FAQs, which are already shaped as one question with one answer.

**Agency Grant**: Explore options and recommend. Nothing is built until Kay answers.

---

## Explicitation

**What I understand**:

1. **Grouping and rewriting are separate moves.** Grouping by topic (tagging what already exists) adds no new medical text. Rewriting into topic cards does add new text. Most of the benefit, and all of the risk, is in rewriting.
2. **Synthesis moves the AI's writing; it doesn't remove it.** A synthesized card is model-written medical text. The original requirement is *clinician-approved* content. Raw ADA text counts as approved because of where it comes from; a card doesn't count until a clinician reads it. With review, synthesis is a safety gain: the model writes once and a human checks it once, instead of the model writing fresh at every question with only the fixed-rule guard checking. Without review, it's the same risk moved somewhere less visible.
3. **The answer shape matters more now.** Since "one question, one reply" (ADR-0006, iteration 7), a blocked answer is replaced by exactly one passage. That passage has to read as a complete answer. Raw chunks often start mid-list or mix two topics.

4. **This reopens part of an earlier decision, on purpose.** In ADR-0005, QST-DIAB-ANSWER-PATH first proposed a set of curated cards. Kay answered "I'm feeding in entire ada's education material", and that question was superseded. Kay then chose constrained RAG (QST-WHICH-APPROACH-SHOULD-I: C), knowing every answer would be new text no clinician had seen. Topic cards *derived from* the ADA library are a different thing from the hand-curated cards first proposed: the library stays the source. Option C below also keeps the whole library searchable. So C refines Kay's earlier answer rather than reversing it; B would narrow it. Runtime RAG stays in every option.

**Assumptions**:

- Questions from older adults concentrate on a small set of topics: lows, highs, meals, fruit, drinks, sick days, activity, foot care, and checking glucose. This is unmeasured; the six live questions so far fit it.
- Kay's clinical sponsor can review on the order of 20–30 short cards before the demo. Unknown.
- Derived cards are treated like the ADA text: never committed to the public repo, stored only in the database.

**Confirm**: Kay (the two questions below). The sponsor's capacity for review is the hidden variable in both.

---

## Questions

### QST-KB-SHAPE: What should the assistant answer from?
- Status: unanswered
- Why asking: Today the assistant searches 136 passages cut straight from the source PDFs: 99 from the two ADA "Your Rights and Care Standards" guides, 37 from the plate, sweeteners, portion, nutrition and liver leaflets, and 13 care-team FAQs. The misfires in the first live test came from those raw chunks (stale headings, two topics per chunk). The FAQs, shaped as one question and one answer, behaved best. The alternative is an offline step that groups the material by topic and writes plain-language cards. Those cards would be new medical text, so they need a clinician's approval (see QST-KB-REVIEW).
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Raw passages, cleaned**: keep today's design. Fix the chunker so headings come only from real headings (TD-5), clean stray characters, and keep tuning search. There's no new text to approve. Readability stays at the level of the ADA documents, and one topic stays spread over several chunks.
- **B — Topic cards replace passages**: offline, a model groups *all* the material by topic and drafts one plain-language card per topic, roughly 30–50 cards. Each card lists the source passages it came from. A clinician approves every card. The assistant searches only cards; raw passages are kept only to trace where a card came from.
- **C — Topic cards for common questions, passages for the rest**: cards for the 20–30 topics older adults actually ask about, drafted the same way and approved by a clinician. The assistant searches cards first and falls back to raw passages for anything a card doesn't cover. Starting the card list from the care-team FAQ questions and the clinic's triage workflow keeps it grounded.
- **D — Topic tags only, no rewriting**: a model labels each existing passage with topics, and search uses the labels to keep a topic's passages together. No new text, so nothing new to approve. It doesn't fix readability or chunks that start mid-list.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**C — topic cards for common questions, passages for the rest.** *Rationale*:
- The FAQ-shaped passages were the ones that worked in the live test, and C makes more content that shape: `team-faqs-005` answered "What fruit can I eat?" cleanly, and `team-faqs-009` is literally "Why is my blood sugar high?".
- The raw chunks were the ones that misfired: `ada-t2-guide-021` and TD-5.
- Capping cards at the common topics keeps review to one sitting for the sponsor.
- The raw-passage fallback keeps coverage for unusual questions, so C never answers worse than A.
- A build-time check can hold cards to the same rule as the answer guard: every number in a card must appear in its source passages. Number drift gets caught before a clinician ever reads the card.
- B makes the sponsor review everything.
- D doesn't touch readability, which matters most for this audience.

*Confidence*: 0.65 — because the evidence is six questions from one person; the topic list is my guess until testers' questions are logged; and the sponsor's review time is unknown. *If wrong*:
- If the sponsor can't review about 25 cards before the demo, flip to **A** (with D's tags if retrieval still misfires).
- If logged questions show most turns falling past the cards to raw passages, the card list is wrong. Grow it toward **B** rather than abandon it.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

### QST-KB-REVIEW: If we write topic cards, who approves them before patients see them?
- Status: unanswered
- Why asking: This only matters if the answer to QST-KB-SHAPE is B or C. Cards are model-written medical text. The original brief requires clinician-approved education content, and raw ADA text met that by source; a card can't. The approval rule decides whether synthesis is a safety gain (written once, checked once) or a quieter version of the runtime risk.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Sponsor approves every card**: each card starts as a draft. Only cards the clinical sponsor has approved, with their name and date stored on the card, are searchable. Changing a card's text makes it a draft again.
- **B — Team checks, sponsor spot-checks**: a teammate checks each draft against its sources, and the sponsor reviews a sample. Cards go live after the team check.
- **C — No clinician review, labelled as AI**: cards go live right away, shown as "summary written by AI from ADA material".

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — sponsor approves every card.** *Rationale*:
- "Clinician-approved education content" is a stated requirement in the original brief.
- C breaks it outright. B leaves unreviewed medical text live between spot-checks.
- Storing the approver and date on each card, and making unapproved cards unsearchable, makes the rule enforced by the system rather than remembered. It also gives the class write-up a clean story.

*Confidence*: 0.8 — because the requirement is explicit; the only real uncertainty is the sponsor's time. *If wrong*: if the sponsor says spot-checking a sample is how their clinic already reviews patient education material, flip to **B**, and record that norm here.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Supporting Materials

### NOT: what the knowledge base holds today (from `kb/out/passages.json`, 2026-11-14)
- 136 passages in total: 72 from the type 1 "Your Rights and Care Standards" guide, 27 from the type 2 guide, 7 from Plan Your Diabetes Plate, and 4 each from Liver Health, Sugar Substitutes, Portion vs. Serving, and Food & Nutrition FAQs. There's 1 from Exercise and Nutrition, and 13 care-team FAQs.
- 22 passages are tagged `dose_related`: never given to the model, and shown word for word only in place of an answer (ADR-0005; ADR-0006, iteration 7).

### NOT: what the first live test showed
- "how to lower my blood sugar after a meal" retrieved `ada-t2-guide-021` first. That's the hypoglycemia Rule of 15, under a stale "After eating" heading. It was shown word for word, because the model's answer was blocked.
- `ada-t2-guide-020` mixes after-meal targets with the definition of hypoglycemia in one chunk.
- "What fruit can I eat?" matched `team-faqs-005` first, which is a clean FAQ answer.
- Scripts: `scripts/ephemeral/2026-11-14-search-probe.ts` prints rankings (ids and scores only). Log: `triage_events.detail` in production.

### COD: sketch of the card pipeline (B or C)
```
kb:synthesize   for each topic: retrieve its source passages, then the model drafts a card
                (plain words; numbers only from sources; source ids listed)
                build check: every number in the card appears in its sources, else reject
                output kb/out/cards.json, gitignored like all ADA-derived text
kb:review       cards.md for the sponsor: card text beside its sources
kb:load         loads cards as drafts; approving sets approved_by and approved_at;
                search sees approved cards only
```
Cost: drafting about 25 cards with Haiku 5.5 over about 60k source tokens is around $0.05. That's a live model run, so it needs Kay's OK first (ADR-0012).

---

## Decision

Pending Kay's answers to QST-KB-SHAPE and QST-KB-REVIEW.

---

## Open Follow-ups

- [ ] **A doubt worth keeping:** if approved cards cover the common questions well, does the runtime answer model still earn its place for those questions? Showing the matching approved card word for word would be safer, and possibly just as good, for this audience. The model's job would shrink to choosing the card and handling the long tail. Revisit after QST-KB-SHAPE.
- [ ] Log which card or passage answered each turn, so the topic list can be checked against what testers actually ask. That's the falsifier for C.
- [ ] TD-5 (stale chunk headings) needs fixing under every option, because raw passages stay as the fallback (C), the provenance (B), or the whole knowledge base (A, D).

---

## Iterations

### Iteration 1 (2026-11-14)
- Trigger: Kay's question after the first live chats (quoted under Originating Context)
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Options drawn up as raw (A), cards only (B), cards plus raw fallback (C), and tags only (D). Review rule asked separately. Evidence from the first live test recorded.
- Outcome: Draft (two questions open)

---

## Links

- Related ADRs:
  - [ADR-0005](0005-diabetes-education-bot-architecture-and-answer-path.md): answer path, RAG, verbatim dose passages. QST-DIAB-ANSWER-PATH (curated cards, superseded by Kay's "entire ADA material") and QST-WHICH-APPROACH-SHOULD-I: C are the decisions this ADR refines.
  - [ADR-0006](0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md): iteration 7, one question one reply
  - [ADR-0012](0012-model-choice-under-a-15-dollar-openrouter-budget.md): budget, live runs need Kay's OK
- Related debt: TD-5 in `docs/TECHNICAL-DEBT.md`
- Related code: `src/lib/kb/chunk.ts`, `kb/build.ts`, `kb/load.ts`, `src/lib/chat/retrieve.ts`
