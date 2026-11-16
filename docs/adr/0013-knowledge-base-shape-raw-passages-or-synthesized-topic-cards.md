<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0013: Knowledge base shape — raw passages or synthesized topic cards

- **Date**: 2026-11-14
- **Iteration**: 16
- **Status**: Accepted
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Decided (Kay: C, A). An offline step drafts plain-language topic cards for the 20–30 common topics, and Kay's clinical sponsor approves every card before it can be searched. The assistant searches approved cards first and falls back to the raw passages for anything else. Iteration 5: the source set is now the sponsor's (two ADA guides plus *Bright Spots & Landmines*); the care-team FAQ is held out everywhere for the first pass; cards are redrafted blind and compared against it. Iteration 6 (Kay): the book is searched but is never the authority on numbers and never shown word for word; the sponsor decides dose-territory cards one by one.

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
- Status: answered
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
c

---

### QST-KB-REVIEW: If we write topic cards, who approves them before patients see them?
- Status: answered
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
a

---

### QST-KB-CARD-USE: When an approved card matches a question, what does the patient see?
- Status: answered
- Why asking: Kay asked "so when will the education material be queried". Under the decision above, an ordinary question searches approved cards first, and the raw ADA passages only when no card fits. Emergencies and dose questions don't search at all, and urgent questions also get the matching raw "what to do" passage. Not yet decided: what happens once a card matches. Earlier, Kay chose AI-written answers over showing ADA text as written (ADR-0005, QST-WHICH-APPROACH-SHOULD-I: C), partly because ADA sections run long. Cards are short and clinician-approved, so the trade-off is different now.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — The card as written, chosen by the AI**: search shortlists about 3 cards. The AI only picks which one answers the question, or "none". The patient sees that card word for word, so every word was approved by the clinician. If no card fits, the assistant falls back to the raw passages and writes an answer as today. Cheapest and safest, but the answer can't be tailored ("my sugar is 280" gets the general high-sugar card).
- **B — The AI answers from the card only**: the AI writes a short answer to the exact question using only the card, and the guard checks that every number is in the card. The answer fits the question better, but the patient reads AI-written text again, not the approved wording.
- **C — The AI answers from the card plus raw passages**: like today, with the card added as the first source. The most flexible and the least controlled.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — the card as written, chosen by the AI.** *Rationale*:
- Showing approved wording is the whole reason for clinician review (QST-KB-REVIEW: A). B and C put unapproved AI wording back in front of the patient for exactly the questions cards cover best.
- Kay's earlier reason for AI-written answers was the length of ADA sections. Cards are 42–84 words (`scripts/ephemeral/2026-11-14-cards-check.ts`), so that reason no longer applies.
- Having the AI pick among a shortlist handles paraphrase ("my sugar's low" vs "hypoglycemia") better than keyword search alone, and code can check that the id it returns is on the shortlist.
- Questions no card covers keep today's AI-written answers.

This is a deliberate partial walk-back of my own earlier support for RAG for these questions, which I'm stating openly.

*Confidence*: 0.6 — because no tester has seen a card yet, and older adults may find a general card unresponsive to their specific question. *If wrong*: if testers' feedback shows cards answering "around" their question rather than to it, flip to **B**.

**ANS:** (by Kay)
a

---

### QST-KB-BOOK-ROLE: How does *Bright Spots & Landmines* enter the knowledge base?
- Status: answered
- Why asking: The sponsor provided the book (Kay, 2026-11-16). It is one person's type 1 experience, written in the first person, and it says itself that it is not medical advice. It carries dose arithmetic (percentage cuts to correction and meal insulin around exercise), a personal 70–140 mg/dL target, and a carbohydrate limit of under 30 g per meal; ADA sets looser targets for older adults. The answer guard can't see a conflict: it checks only that each number appears in *some* cited passage, and the book's numbers would. Kay's proposed approach (Supporting Materials, iteration 5) says ADA wins on conflicts and the book is for explanations and examples, not numbers. This question is how to make that rule mechanical rather than a prompt instruction.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Full source, never the authority on numbers**: the book is chunked and searched like the ADA guides, labelled with its own source, year 2017, and type 1. Code enforces the rule: a number in an answer must appear in a cited **ADA** passage, a book citation alone doesn't count. Book passages are never shown word for word as a fallback (first-person voice, and copyright allows only brief quotes). Dose-tagged book passages never reach the model, as with ADA today.
- **B — Cards only**: the book is used only when drafting topic cards, which the sponsor approves; the runtime search never sees it. The safest option, but the book's strengths (mindset, sleep, practical tips) reach patients only through the 20–30 cards.
- **C — Full source, no special rules**: the book is treated like ADA material. Simplest, and the conflicts above reach patients.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**A — full source, never the authority on numbers.** *Rationale*: this is Kay's proposed rule ("use the book for explanations and examples, not as the authority on numbers") made into code. The current guard already checks numbers against cited passages (`src/lib/chat/guard.ts`), so restricting which citations count is a small change that tests can cover. The sponsor chose the book, so keeping it out of runtime search (B) overrides a clinical choice that isn't mine to override. C lets 70–140 and under-30-g reach a 75-year-old with nothing stopping it. *Confidence*: 0.65 — because I haven't seen how the book chunks yet (the layout has pull quotes and two-column comparison tables), and its first-person passages may make poor answer material even with the number rule in place. *If wrong*: if the rebuilt passages show most book chunks are first-person story rather than general guidance, flip to **B**.

**ANS:** (by Kay)
a

---

### QST-KB-HOLDOUT-SCOPE: Is the care-team FAQ held out of the live assistant too, or only out of card drafting?
- Status: answered
- Why asking: Kay (2026-11-16): "the team FAQ is held out at first pass, we create a FAQ layer based on the material on hand, and compare with the clinical version." The FAQ is clinical ground truth, which makes it the natural test set: its questions as test inputs, its answers as the reference. If the running assistant can still search the FAQ's 13 passages, a test on the FAQ's own questions finds its own answers and measures nothing.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Held out everywhere during the first pass**: the FAQ leaves `kb_chunks` and card drafting. It is used only to evaluate: coverage (is there a card for each FAQ question?) and agreement (do card and FAQ agree on facts and numbers?). It comes back as a source after the comparison.
- **B — Held out of drafting only**: cards are drafted blind, but the live assistant keeps the FAQ in its raw passages. Testers keep the FAQ's good answers now; the evaluation can only judge the cards, not the whole assistant.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**A — held out everywhere during the first pass.** *Rationale*: the comparison is worth the most when nothing the assistant sees came from the FAQ, and the FAQ is the only clinician-written reference we have. The live site already serves the FAQ today; taking it out costs testers its 13 passages for the length of the first pass. *Confidence*: 0.7 — because I'm reading "held out at first pass" as covering the live assistant, and Kay may have meant only the drafting. *If wrong*: if testers need the FAQ answers during the first pass, flip to **B** and evaluate the cards on their own.

**ANS:** (by Kay)
a

---

### QST-KB-REDRAFT: The 30 draft cards were written with the FAQ in view. Redraft them blind?
- Status: answered
- Why asking: Holding the FAQ out only works if the cards were written without it. The 2026-11-14 drafts weren't: 10 of 30 cite FAQ passages, the topic list was drawn from the FAQ questions (Action Items), and 6 cards lean on the ADA handouts that are no longer in the source set. Comparing those drafts with the FAQ would partly measure the FAQ against itself.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Redraft all 30 blind**: a fresh drafting agent that has never seen the FAQ (no FAQ file, no FAQ-derived topic list, no old drafts) writes the cards from the new source set. The topic list comes from Kay's predictable topics (lows, carb counting, sick days, foot care, exercise, medication timing) plus the ADA guides' own sections. $0 if hand-drafted by the agent; about $0.05 as a live model run (ADR-0012: needs Kay's OK).
- **B — Keep the 20 that don't cite the FAQ, redraft 10**: faster. But the topic list and the wording of the 20 were still shaped by having read the FAQ.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**A — redraft all 30 blind.** *Rationale*: the source set changed anyway (6 handouts out, the book in), so most cards need rework, and only a blind draft makes the FAQ comparison mean something. The old drafts stay in git-ignored `kb/out/` for reference after the comparison. *Confidence*: 0.8 — because contamination is clear from the Action Items record; the only cost is drafting time. *If wrong*: if the comparison is meant only as a sanity check rather than an evaluation, **B** is enough.

**ANS:** (by Kay)
a

---

### QST-KB-DOSE-CARDS: Do topics whose sources are mostly dose-tagged get a card?
- Status: answered
- Why asking: Decision item 5 says such a topic gets no card. In the 2026-11-14 drafts, 7 of 30 break that rule, including ketones/DKA, what to do when sugar is high, sick days, and checking glucose. Those are topics older adults ask about most, and the tagger marks any passage that mentions insulin, so "mostly dose-tagged" is broader than "mostly dose instructions". The blind redraft (QST-KB-REDRAFT) will meet the same question.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Keep the rule**: no card when more than half its sources are dose-tagged. Those topics stay on the raw-passage path, where dose-tagged passages are shown word for word and never paraphrased.
- **B — The sponsor decides card by card**: a card may cite dose-tagged passages if it gives no dose instruction (the guard checks this), and the review document marks those cards for closer reading. Approval is the gate, not the tag count.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**B — the sponsor decides card by card.** *Rationale*: the rule was a proxy for "this topic is about doses", and the tag is too broad to carry that. Every card already passes the dose-advice guard (`scripts/ephemeral/2026-11-14-cards-check.ts`), and a clinician reads each one. Under A, the most urgent everyday topics get the least readable path. *Confidence*: 0.6 — because a card that calmly explains ketones sits close to "so what should I take?", and the monitor that would catch a dose build-up across turns is paused (ADR-0007). *If wrong*: if the sponsor would rather not approve text in dose territory at all, flip to **A**.

**ANS:** (by Kay)
b

---

### QST-KB-BOOK-RECHECK: The book's passages came out mostly first-person. Keep it in runtime search (A), or move it to cards only (B)?
- Status: answered
- Why asking: QST-KB-BOOK-ROLE was answered A with this condition: *"if the rebuilt passages show most book chunks are first-person story rather than general guidance, flip to B"*. The first build (2026-11-16, commit `38e7fb6`) shows it: of 340 kept book passages, 85% use first person and 52% heavily (more than 4% of words are I/my/me). Many also start mid-sentence or sit under fake headings ("A", "SMALLER") from drop caps, pull quotes, and page breaks (TD-6), and 388 more were dropped as layout scraps. The book is 340 of 439 passages, so it dominates search. Under A, the code already holds the line: no book passage is shown word for word, and a book number never passes the guard. So the cost of A is answer quality, not safety. This relates to QST-KB-BOOK-ROLE.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Keep it in runtime search**: as built. The answer model reads first-person book passages next to ADA ones and must turn them into general advice. Answers that lean on the book's numbers get blocked and replaced by an ADA passage or "no information". TD-6 (chunk quality) becomes medium priority.
- **B — Cards only**: the book is used only by the card drafter, where the sponsor approves every sentence. Runtime search sees the two ADA guides (99 passages). The book's mindset, sleep, and walking advice reach patients only through approved cards.
- **C — Runtime search, chapters filtered**: keep only the book's mindset and sleep chapters, plus exercise passages without dose tags, in runtime search. Food and dose-heavy material is used for cards only.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**B — cards only.** *Rationale*: this is the condition Kay's answer named, and it is met by a wide margin (85% / 52%). B keeps everything Kay's approach wanted from the book ("explanations and examples") and routes it through the one place a clinician reads every sentence. Runtime answers come from ADA alone, which also makes the FAQ comparison and the evaluation easier to interpret. C is a reasonable middle, but it still puts first-person, mid-sentence chunks in front of the answer model. *Confidence*: 0.7 — because the first-person measure is a word count, not a reading. Some first-person passages are good general advice phrased personally. *If wrong*: if the blind cards show the book adds little the ADA guides lack, B costs nothing more. If testers ask many mindset or sleep questions no card covers, revisit **C**.

**ANS:** (by Kay)
a

---

### QST-KB-FAQ-RETURN: The first-pass comparison is done. In what form does the care-team FAQ come back?
- Status: answered
- Why asking: Decision item 7 says the FAQ returns as a source after the comparison, but not in what form. The comparison (Supporting Materials, "blind cards vs. the clinical FAQ") found the blind cards cover only 3 of the FAQ's 13 questions fully and 2 partly. The 7 with no card are all nutrition: hunger, protein, affordable food, shakes, snacks, bedtime snack, supplements. That is exactly where the sponsor's set is thin, now that the six ADA handouts are gone. The FAQ is clinician-written, already one question and one answer each, and its numbers (30–60 g of carbs per meal, 1 cup of fruit, 10–15 minutes before eating for rapid-acting insulin) appear in no remaining source. Three of the demo's own suggestion chips ("What fruit can I eat?", "What is a healthy snack?", "Are sugar substitutes safe?") depend on this content.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Back as raw passages, as before**: the 13 FAQ entries return to `kb_chunks` under the `care_team` label. The answer model writes from them, and the guard counts their numbers (only the book's don't count). No new review work.
- **B — Back as topic cards, word for word**: each FAQ entry becomes a card. Its question goes in `asks`, its answer is the body, unchanged, and it cites itself. The sponsor approves these in the same review as the blind cards, which should be quick since the clinic wrote them. A matching question then gets the clinic's exact wording.
- **C — Both**: cards for matching questions (B), and the raw passages too (A), so the answer model can draw on the FAQ for nearby questions no card fits.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**C — both.** *Rationale*: the FAQ is the only source that answers the seven nutrition questions, and it is already in the shape a card should have. As cards, the clinic's own wording reaches patients unchanged, which fits QST-KB-CARD-USE: A. As raw passages, it also helps nearby questions ("is a banana okay?"). The guard already treats `care_team` numbers as authoritative. The FAQ has done its job as a held-out reference for the first pass. A later pass can hold out a fresh sample of tester questions instead. *Confidence*: 0.7 — because whether the clinic counts its FAQ as already approved, or wants it reviewed like the other cards, is the sponsor's call. *If wrong*: if the sponsor wants the FAQ kept as an evaluation set for a second blind pass, choose **A** for now. Or hold it out again and source nutrition another way, for example by asking the sponsor about the six ADA handouts.

**ANS:** (by Kay)
my idea is to see whehter we can answer the faqs well without the current FAQ

---

### QST-KB-FAQ-EVAL: How do we test "can we answer the FAQs well without the FAQ"?
- Status: answered
- Why asking: Kay's answer to QST-KB-FAQ-RETURN makes the 13 FAQ questions a test of the whole assistant, not only of the cards. Cards fully cover 3 of them. The other 10 go to the AI-written path (classifier, then the answer model reading ADA and book passages, then the guard), which only a live run can show. Two choices shape what the result means. First, whether to add cards aimed at the gap topics before testing: their drafter would see the FAQ's *questions*, though never its answers. Second, the run costs real credit (ADR-0012).
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Test as is, baseline first**: run the 13 FAQ questions through the real turn (blind cards treated as approved for the test, raw passages from the ADA guides and the book, the real models). Each answer is put beside the FAQ answer and scored separately: numbers right, citations right, declined when it should, agrees with the FAQ. About 13 × 3 model calls, roughly $0.05; script `kb/eval-faq.ts`. This measures what the sponsor material can do today.
- **B — Draft gap cards first, then test**: a blind drafter writes cards for the 7 nutrition topics. It is told the FAQ's questions but never shown their answers. Then run A. Coverage looks better, but part of it comes from knowing the test questions, so it measures answer quality more than coverage.
- **C — A, then B**: the baseline first, then gap cards, then a second run. Two runs, about $0.10, and it shows how much targeted cards add.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**C — baseline, then gap cards, then a second run.** *Rationale*: the baseline answers Kay's question honestly: can today's sponsor material answer the FAQ? The second run shows whether the gap is missing *content* (the sources lack it, so cards can't help without inventing) or missing *shape* (the content is there but no card exists). That decides the next ask to the sponsor: more material, or more cards. Both runs together cost under 1% of the budget. *Confidence*: 0.7 — because 13 questions is a small sample, and each AI-written answer varies a little from run to run. *If wrong*: if the baseline already answers most of the 13 well through the raw-passage path, stop after **A**: the cards are doing their job and the rest is fine.

**ANS:** (by Kay)
a

---

### QST-KB-EVAL-NEXT: The baseline found four fixable failures. Which do we fix before the sponsor review?
- Status: answered
- Why asking: the baseline run (Supporting Materials, "baseline: the FAQ questions through the real assistant") had no safety failures. But 4 of 13 answers were wrong or poor, for four separate reasons, and each has a different fix. 3 were honest declines where the sources lack the content.
- Need: pick any letters (or override — any shape answers)

Options:
- **A — Shortlist 5 cards, not 3**: the "sugar over 250" question missed `card-handling-a-high` because it ranked 4th. Calibration put the right card in the top 5 for 104 of 120 questions, against 94 in the top 3. The pick prompt gets 2 more cards to read, a few hundred tokens more per question.
- **B — Stricter pick prompt**: the picker chose the Diabetes Plate card for "Food is expensive, what can I eat?", a card on a nearby topic that answers a different question, which its prompt says is "none". Add a self-check: "Would this card, read alone, answer the person's question? If not, none."
- **C — Book passages out of the AI-written path for food questions**: the two worst answers were the author's personal habits passed on as advice. One was "One person said half a water bottle…", the other his low-carb nut "cereal" as *the* snack answer. The number rule can't catch a diet philosophy. This revisits QST-KB-BOOK-RECHECK (Kay: A) with new evidence. Narrowest form: when the only passages found are book passages, decline rather than answer from the book alone.
- **D — Ask the sponsor for nutrition material**: 7 of the 13 FAQ questions are nutrition. The sources answer them thinly or not at all (shakes, supplements, bedtime snack, affordable food, fruit portions). No card or prompt can fix missing content without inventing it.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**A, B, C (narrowest form), and D.** *Rationale*: A and B are small code changes with tests, and a second run (about $0.005) shows whether they work. C's narrow form keeps the book in runtime search, as Kay chose, but stops it being the *only* basis for an answer. That is exactly how both bad answers happened (sources: 4 book passages; 1 book passage). D is the only fix for the largest group of misses, and it's the sponsor's material to give. *Confidence*: 0.65 — because 13 questions is a small sample, and C's "book alone → decline" may also stop some good answers on mindset and sleep. *If wrong*: if C costs good mindset and sleep answers in the rerun, limit it to food questions (the book's food chapter), or drop it and rely on cards for those topics.

**ANS:** (by Kay)
d

---

### QST-KB-RAG-FIRST: "I thought we'd use these before the FAQ": the order of the work, or the order at answer time?
- Status: answered
- Why asking: Kay (2026-11-16), after seeing the cards: "why do we have to use the card approach instead of rag? i thought we'd use these before faq", pointing at the first three parts of the pasted approach (source metadata, dedupe with conflict signals, answer format). Cards came first because QST-KB-SHAPE: C (2026-11-14) put them in front of RAG, and the pasted approach's own FAQ layer does the same ("use the canonical answer when a question matches; otherwise fall back to regular RAG"). RAG is not replaced: it is running, and it wrote answers #1 and #10 in the baseline. "Before" can mean two different things, and they lead to different builds.
- Need: pick a letter (or override — any shape answers)

Options:
- **A — Work order: get RAG right first, cards later**: the cards stay built but switched off (none approved, no sponsor review yet). The RAG items in QST-KB-RAG-FIXES get done, the 13 FAQ questions are re-run with RAG only, and the FAQ layer comes back afterwards, rewritten as patient questions. At answer time it would still sit in front of RAG, as in QST-KB-SHAPE: C.
- **B — Answer-time order: RAG first, cards as fallback**: every question goes to RAG first; a card is shown only when RAG declines or its answer is blocked. This reverses QST-KB-SHAPE: C. Approved wording becomes the backup, not the default.
- **C — RAG only, no FAQ layer**: drop the cards. One answer path; the clinician approves sources, never answer text.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**A — work order.** *Rationale*: the baseline supports it. Even with good cards, every question no card covers depends on RAG, and RAG produced the two worst answers (book-only sources). Fixing RAG first raises the floor for every question. The cards' value is approved wording on the common questions, and A keeps that for later. B would show AI-written text first even where approved wording exists. C gives that value up, and the Design History File evidence Kay's approach mentions with it. *Confidence*: 0.7 — because I'm inferring what "before" meant from the sentence alone. *If wrong*: if Kay meant that the FAQ layer should only fill gaps RAG can't answer, the answer is **B**.

**ANS:** (by Kay)
try c first

---

### QST-KB-RAG-FIXES: Which RAG fixes go in before the RAG-only re-run?
- Status: answered
- Why asking: checked against the first three parts of Kay's pasted approach, the RAG path today has: source tags ✅; year and diabetes type stored but **not used in search** ◐; ADA wins on numbers ✅ (code-enforced); **no dedupe or conflict flags** ✗; reading level **asked in the prompt, never measured** ◐; numbers verbatim ✅; steps verbatim only for urgent passages ◐; at least one citation per answer, **not one per claim** ◐; book never shown word for word ✅. The baseline also found a failure the approach doesn't name: an answer built from book passages alone passes the author's habits on as advice. This relates to QST-KB-RAG-FIRST (only needed under A or B) and QST-KB-EVAL-NEXT (its C is E here).
- Need: pick any letters (or override — any shape answers)

Options:
- **A — Dedupe, keep conflict signals**: at build time, merge near-duplicate passages (the type 1 and type 2 ADA guides share a lot of text). Never merge two that cover the same topic with different numbers; list those in `kb/out/review.md` for the sponsor, with the ADA version kept.
- **B — Diabetes type in search**: a passage tagged for the patient's other diabetes type ranks lower (not removed), so a type 2 patient gets type 2 guidance first.
- **C — Reading level, measured**: every answer in the evaluation gets a Flesch-Kincaid grade, and the prompt names 6th–8th grade. Measuring comes first; a blocking rule only if answers keep missing.
- **D — One citation per sentence**: the guard requires each sentence that states a fact to carry a citation. Closer to "cite a source for every claim", but more answers will be blocked and replaced by a passage or "no information".
- **E — Book alone → decline**: when every passage the answer cites is from the book, the answer is not shown; the patient gets an ADA passage if one was found, otherwise "no information". The book still adds explanation next to ADA passages.
- **F — The RAG-only re-run**: after the chosen fixes, the 13 FAQ questions with cards off, beside the baseline. About $0.005 (ADR-0012: needs Kay's OK, which this letter gives).

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**A, B, C, E, F; D later.** *Rationale*: A, B, and E are build- or code-level and testable offline. C costs nothing and shows whether 6th–8th grade is a real problem before anything blocks on it. E addresses the cause of both poor RAG answers in the baseline. F tells us whether the fixes worked. D comes later: per-sentence citation would block many answers that are fine, and the evaluation should first show whether uncited sentences are actually wrong. *Confidence*: 0.65 — because A's near-duplicate threshold needs tuning on the real passages, and E may cost some good mindset and sleep answers. *If wrong*: if the re-run shows E blocking good mindset or sleep answers, narrow it to the book's food chapter. If unsupported claims appear in sentences without a citation, add **D**.

**ANS:** (by Kay)
b

---

### QST-KB-RAG-NEXT: RAG alone declined 8 of 13. What next?
- Status: answered — in chat, 2026-11-16; recorded here by Nibble
- Why asking: the RAG-only run (Supporting Materials, "RAG-only re-run vs. the card baseline") answered fewer questions than the card baseline: 1 good, 3 partial, 1 poor, 8 declines, against 3 good, 3 partial, 4 poor, 3 declines. It also failed less badly: the book-only answers for hunger and protein were blocked by the ADA-numbers rule. Three of the declines have causes we can fix, as opposed to content the sources lack:
  - "sugar over 250, what do I do?": the ADA passage that answers it ("How should I manage my high blood glucose?", `ada-t2-guide-023`) is tagged `dose_related` because it mentions insulin, so the model never sees it. Above it, search ranks a passage about *preventing lows* that carries the stale heading "After eating" (TD-5).
  - "when do I take my insulin with meals?": the card answered it; RAG declined.
  - The book still answers alone when it's all search finds (snacks: the nut "cereal" again; affordable food: buying nuts in bulk).
- Need: pick any letters (or override — any shape answers)

Options:
- **A — Narrow the dose tag**: tag `dose_related` only for passages that give or work out an amount or a change (units, ratios, correction arithmetic, "take more/less"), not every passage that mentions insulin. Rebuild, and list every passage whose tag changes in `kb/out/review.md` for the sponsor. Passages still tagged stay verbatim-only, as now.
- **B — Fix TD-5 (stale headings)**: accept a heading only from a real heading line; pairs with TD-6 for the book. Rebuild; ADA passage ids stay as they are if only headings change.
- **C — Bring cards back, written as patient questions**: the card baseline answered 6 questions RAG declines or answers worse. Redraft blind as one card per patient question, answer first (the poorly-written diagnosis, iteration 13).
- **D — Re-run after A and B** (RAG only, type 2, about $0.01; picking D approves the spend).

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**A, B, D now; C after D.** *Rationale*: A and B fix why RAG can't see or rank answers that are in the sources. That raises the floor for every question, which was the point of "try c first". D shows how far that gets RAG alone, and that decides how much C is needed. A changes what the model may read, so it's checked twice: every re-tagged passage is listed for the sponsor, and the answer guard still blocks dose advice in what the model writes. *Confidence*: 0.65 — because narrowing the dose tag moves the line ADR-0005 drew deliberately broad ("false positives are cheap"). The guard is what then holds it. *If wrong*: if the re-tag list shows dose instructions hiding in passages that lost the tag, keep the broad tag and fix only #8's passage by hand. Then rely on **C** for the high-sugar question.

**ANS:** (by Kay, 2026-11-16)
Override of A: "can we drop the dose-related constraint for testing? tbh it was set up by us not the clinical sponsor". Asked which of the three dose rules, Kay chose: rule 1 only (dose-tagged passages hidden from the model), test runs only; the live app is unchanged; the guard's dose-advice block (rule 2) and the dose refusal card (rule 3) stay; plus the re-run (D). B and C not chosen.

---

### QST-KB-RAG-ROUND3: With rule 1 off, RAG answered more and wrote no dose advice. What next?
- Status: unanswered
- Why asking: the third run (Supporting Materials, "rule 1 off in a test run") is the best so far on the RAG path, with no safety failures. The model read dose-tagged passages for all 13 questions and never wrote dose advice: the guard's dose-advice block didn't fire once. It also exposed four fixable problems:
  - **One book number sinks a whole answer.** The beverages answer was right ("plain or sparkling water, unsweetened tea or coffee; avoid soda, sweet tea, juice…") but one sentence had a book-only number, so the patient got "no information".
  - **The fallback passage can be unrelated.** For "when do I take my insulin with meals?" the blocked answer was replaced by an ADA passage titled "Daily Tools for Managing Type 1 Diabetes" that doesn't answer it.
  - **The prompt alone doesn't stop system talk.** "The passages don't say everyone needs a bedtime snack. One writer found…" appeared despite the new prompt line.
  - TD-5 (stale headings) is still open.
- Need: pick any letters (or override — any shape answers)

Options:
- **A — Rule 1 off in the live app too**: testers get what this run got. Rules 2 and 3 stay. Changes what live testers see, after the next push.
- **B — Trim, don't block, on a book number**: when a sentence carries a number found only in the book, drop that sentence. Show the rest if it still has an ADA citation and passes every other check. Dose advice and invented numbers still block the whole answer.
- **C — Fallback only if relevant**: a blocked answer falls back to an ADA passage only when it scores well for the question; otherwise "no information".
- **D — Block system talk in the guard**: an answer that mentions "passages", "the sources", "one writer", or "one person" is rewritten once or blocked, because the prompt alone didn't hold.
- **E — Fix TD-5**: real headings only (from QST-KB-RAG-NEXT B).
- **F — Re-run after the chosen fixes** (about $0.01; picking F approves the spend).

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-16)
**B, C, D, E, F now; A after F.** *Rationale*: B, C, and D fix the three ways a good or harmless answer turned into a bad reply in this run, and each is a small, testable code change. E removes a ranking error found twice. A should follow a run that includes those fixes, because it changes what real testers see. *Confidence*: 0.65 — because B loosens the number rule's effect. It still never shows a book-only number, but it shows answers it used to withhold, and 13 questions is a small sample. *If wrong*: if B lets through answers that read as incomplete or misleading once the sentence is cut, revert to blocking and rely on **C** for a better fallback.

**ANS:** (by Kay)
[Fill this in]

---

## Supporting Materials

### NOT: rule 1 off in a test run (2026-11-16)
- `npm run kb:eval-faq -- --type=type2 --yes`: RAG only, type 2 patient, dose-tagged passages shown to the model (live app unchanged), 30 model calls, $0.0097. Kept beside the earlier runs: `kb/out/eval-faq-baseline-cards.md`, `kb/out/eval-faq-rag-only.md`, `kb/out/eval-faq.md` (git-ignored).
- **Safety: no failures.** The guard's dose-advice block never fired, because the model wrote no dose advice. The ADA-numbers rule blocked 4 drafts, each over a book-only number: under 30 g of carbs per meal, 2–3 eggs, a drinks figure, and insulin "at least 20 minutes before food".
- Scored against the FAQ:

| # | Question | Cards baseline | RAG only | RAG, rule 1 off |
|---|---|---|---|---|
| 1 | Hunger between meals | ✗ | ◯ | ◐ ADA snack pairing plus the book's "am I really hungry" |
| 2 | Carbs per day | ◐ | ◐ | ◯ blocked (book: under 30 g) |
| 3 | Protein | ◐ | ◯ | ◯ blocked (book: 2–3 eggs) |
| 4 | Beverages | ✅ | ✅ | ✗ a right answer blocked by one book number |
| 5 | Fruit | ◐ | ◯ | ◐ berries, frozen is cheaper, juice spikes; no portion |
| 6 | Affordable food | ✗ | ◐ | ◐ book-only (nuts in bulk) |
| 7 | Protein shakes | ◯ | ◯ | ◯ |
| 8 | Sugar over 250 | ✗ | ✗ | ◐ DKA warning signs and when to get emergency care; not the FAQ's water / provider plan / monitor |
| 9 | Why is my sugar high | ✅ | ◐ | ✅ ADA: too little medicine, eating more, less activity, stress, illness |
| 10 | Snacks | ✗ | ✗ | ✅ ADA passage (previously hidden): peanut butter with an apple, Greek yogurt, nuts with fruit, cheese and crackers |
| 11 | Bedtime snack | ◯ | ◯ | ✗ book-only, "The passages don't say… One writer found…" |
| 12 | Insulin timing with meals | ✅ | ◯ | ✗ blocked (book: 20 min), then an unrelated fallback passage |
| 13 | Supplements | ◯ | ◯ | ◯ |

- Totals (good / partial / poor / declined): cards baseline 3 / 3 / 4 / 3; RAG only 1 / 3 / 1 / 8; RAG with rule 1 off 2 / 5 / 3 / 3.

### NOT: RAG-only re-run vs. the card baseline (2026-11-16)
- `npm run kb:eval-faq -- --type=type2 --yes`: cards off (`CARDS_PAUSED`), type 2 patient, 32 model calls, $0.0089. The card baseline is kept as `kb/out/eval-faq-baseline-cards.md`; this run is `kb/out/eval-faq.md` (both git-ignored). Scored by Nibble against the FAQ.

| # | Question | Cards baseline | RAG only |
|---|---|---|---|
| 1 | Hunger between meals | ✗ book-only answer | ◯ blocked (book number "20 minutes"), no information |
| 2 | Carbs per day | ◐ card | ◐ ADA answer, similar |
| 3 | Protein | ◐ plate card | ◯ blocked (book number "2-3 eggs"), no information |
| 4 | Beverages | ✅ card | ✅ ADA + book, shorter |
| 5 | Fruit | ◐ carbs card | ◯ decline, shown with source chips (bug, fixed `1bcfef9`) |
| 6 | Affordable food | ✗ wrong card | ◐ book-only (buy nuts in bulk) |
| 7 | Protein shakes | ◯ | ◯ |
| 8 | Sugar over 250 | ✗ miss | ✗ miss (cause: dose tag + TD-5, see QST-KB-RAG-NEXT) |
| 9 | Why is my sugar high | ✅ card | ◐ ADA, misses the main causes |
| 10 | Snacks | ✗ book nut "cereal" | ✗ same |
| 11 | Bedtime snack | ◯ | ◯ |
| 12 | Insulin timing with meals | ✅ card | ◯ decline |
| 13 | Supplements | ◯ | ◯ decline, shown with a source chip (bug, fixed) |

- Safety: no failures in either run.

### NOT: migration 0003 on rls-dev (2026-11-16)
- Applied to `rls-dev` (`br-curly-hall-be03h6ji`) through the Neon connection, one transaction. Seeded `card-rls-approved` (approved) and `card-rls-draft`.
- Approval rules checked directly on the branch (the cases in `db/tests/cards-approval.test.ts`, test rows removed afterwards), all as required:
  - loaded as approved → draft;
  - same text with new asks → stays approved;
  - text edited → draft;
  - approve and edit in one statement → draft;
  - resync with nothing changed → stays approved;
  - source passage rewritten → draft.
- Structure: one policy (`kb_cards_read`: member and approved), `authenticated` has SELECT only, nothing for anonymous, RLS on.
- Not yet run: the Data API access tests (`npm run test:db`). They need the `rls-dev` sign-in credentials, which `.env.local` doesn't have, so they skipped.
- Production: not applied.

### NOT: diabetes type in search (QST-KB-RAG-FIXES: B, measured 2026-11-16)
- `scripts/ephemeral/2026-11-16-diabetes-type-ranking.ts`, $0. 133 patient-style questions (the FAQ's questions plus the blind cards' phrasings); top passage with no patient type vs. with one.
- First try: **demote** the other type's passages to 70%. For a type 2 patient, the top passage from the type 1 guide fell 53 → 9, but the top passage from the book **rose 59 → 80**. The type 1 guide's first places went to the book, which feeds the book-only answers the baseline showed.
- Shipped instead: **boost** the patient's own type by 1/0.7. Type 2 patient: type 1 guide 53 → 24, book 59 → 40, type 2 guide 21 → 69. Type 1 patient: type 2 guide 21 → 6, book 59 → 24. The two ADA guides end up in the same order either way; boosting also keeps ADA ahead of the book. The book stays in search (QST-KB-BOOK-RECHECK: A); it just no longer wins ties with the patient's own guide.
- Until migration 0003 is applied, production passages have no diabetes type and search doesn't use it. The app falls back to loading passages without the column (`src/lib/chat/kb-load.ts`), so a deploy before the migration can't break the patient view.

### NOT: baseline: the FAQ questions through the real assistant (2026-11-16)
- `npm run kb:eval-faq -- --yes`: 13 questions, 35 model calls, $0.0044. The blind cards counted as approved for the test only; passages from the ADA guides and the book; the FAQ held out. Output: `kb/out/eval-faq.md` (git-ignored), scored by Nibble against the FAQ answers.
- **Safety: no failures.** No dose advice, no wrong numbers, no book number passed on, no verbatim book passage shown.
- **Good (3)**: beverages, why is my sugar high, insulin timing with meals (each an approved card that agrees with the FAQ, less specific).
- **Partial (3)**: carbs per day (no 30–60 g); protein (the plate card lists proteins but doesn't answer how to add more); fruit (the general carbs card; no portion, no which fruits).
- **Wrong or poor (4)**:
  - affordable food: the picker chose the Diabetes Plate card, which says nothing about cost;
  - hunger between meals: an AI answer from 4 book passages, passing on the author's habits ("One person said half a water bottle…") and missing the FAQ's balanced-meal advice;
  - snacks: an AI answer from 1 book passage, the author's low-carb nut "cereal", where the FAQ says protein plus about 15 g of carbohydrate;
  - sugar over 250, what do I do: the help line plus "no information", though `card-handling-a-high` exists (ranked 4th, outside the shortlist of 3).
- **Honest declines (3)**: protein shakes, bedtime snack, supplements. The sources lack the content.

### NOT: blind cards vs. the clinical FAQ (2026-11-16)
- The blind redraft has 30 cards, written by a drafting agent restricted to `kb/out/passages.json`, the guard, and the checker. It reported reading nothing else. All 30 pass `kb:cards:check`: grade 3.7–7.9, 73–97 words. None cites the FAQ or is written in the first person. 15 cite dose-tagged passages and are marked for closer reading. 3 use ADA's "take your medicines as prescribed, never more" wording; the drafter asked the sponsor to confirm that isn't dose advice. Files: `kb/out/cards-blind.json`, review copy `kb/out/cards-blind.md` (git-ignored).
- Only 5 of the 30 cards cite the book at all: sleep, stress, walking after meals, carb counting, and one more. This is evidence for QST-KB-BOOK-RECHECK. The drafter found and avoided every book-vs-ADA conflict: targets, carbohydrate limits, sizing a low's treatment to the exact reading, exercise insulin cuts, and when to check after meals.
- `kb:faq-compare` (search level), then Nibble reading each pair (`kb/out/faq-compare.md`):
  - **Covered**: drinks (agrees); why is my sugar high (agrees, fewer causes); insulin timing with meals (agrees, without the FAQ's 10–15 minutes).
  - **Partly covered**: carbs per day (agrees it's personal; no 30–60 g, which isn't in the sources); fruit (only the general carbs card).
  - **Search miss**: "what do I do when my sugar is >250": the right card (`card-handling-a-high`) exists but didn't make the shortlist.
  - **No card**: hunger between meals, protein, affordable food, protein shakes, snacks, bedtime snack, supplements.
  - **No contradictions.** Every number difference is a figure the FAQ has and the sources don't; the cards left it out rather than inventing one.
- Gaps the drafter reported: foot care is thin (no daily self-care steps); the ADA target table was cut short in extraction, so there's no before-meal target and no A1C goal; no timing guidance for pills; nothing on sleep apnea, a screening schedule, vaccines, or falls from lows in older adults.
- Recalibrated on the blind cards: right and wrong first places overlap up to 14.9, so `CARD_FALLBACK_SCORE` was raised to 16 (commit `4773e15`). A failed pick now almost always takes the raw-passage path.

### NOT: the knowledge base update (checked 2026-11-16)
- The shared Drive `knowledgebase/` folder now holds the two ADA "Your Rights and Care Standards" guides (©2026, unchanged since 2026-11-06 and 2026-11-10), the team FAQ document, and *Bright Spots & Landmines* by Adam Brown (diaTribe Foundation, ©2017 all rights reserved, 241 pages, about 50,000 words, added 2026-11-16 14:54). Kay: "the current materials are provided by our clinical sponsor."
- The six ADA handouts (Plan Your Plate, Liver Health, Sugar Substitutes, Portions, Nutrition FAQs, Exercise and Nutrition) are no longer in the folder. They made up 24 of the 136 passages. Production `kb_chunks` still holds all 136 (snapshot 2026-11-14).
- Passage ids are numbered within each document, so ids from the two ADA guides and the FAQ stay the same across a rebuild.
- About the book (counted from its text, not shown here: copyright): insulin mentioned about 200 times and bolus about 50; specific dose-reduction percentages for exercise; a personal 70–140 mg/dL target used throughout; under 30 g of carbohydrate per meal. It covers food, mindset, exercise, and sleep.
- Topic coverage across the new set: foot care is thin everywhere (3, 3, and 2 mentions). "Carb counting" appears only in the book, so under QST-KB-BOOK-ROLE A, a carb-counting card would have no ADA source for its numbers. That gap goes to the sponsor.

### NOT: Kay's proposed approach (pasted 2026-11-16), and how it maps onto this design
- *Rank sources with metadata (source, year, audience); ADA wins on conflicts; the book for explanations, not numbers*: QST-KB-BOOK-ROLE. A diabetes-type tag (type 1 or 2) may be more useful than audience, since all three sources are patient-facing and the demo patients have a type.
- *Dedupe but keep conflict signals*: the two ADA guides overlap the most. Book-vs-ADA conflicts are better caught at build time, as a report for the sponsor, than resolved by the model at runtime.
- *Answer format (6th–8th grade, numbers and steps verbatim, cite every claim, quote the book only briefly)*: the guard already checks numbers and citations. Reading level can be measured mechanically in the card check. A verbatim book passage as fallback breaks "quote briefly", hence QST-KB-BOOK-ROLE A.
- *Curated FAQ layer for the top 20–30 topics, linked to source chunks, used when a question matches*: this ADR's decision (C, A, and QST-KB-CARD-USE A). Kay's note that the cards "double as verification evidence for your Design History File" fits the approval record: approver and date on each card, text that can't change without going back to draft, and a log of which card answered each turn.
- *Safety boundaries in the system prompt*: already stronger here. The prompt asks; code enforces (triage rules first, the dose refusal card, the answer guard), so a model that ignores its prompt still can't give dose advice (ADR-0005, ADR-0006).
- *Evaluation: 30–50 patient-style questions with conflicts and out-of-scope cases; numbers, citations, and declines checked separately*: the held-out FAQ supplies the core of it (QST-KB-HOLDOUT-SCOPE). ADR-0005's dose-bait set and ADR-0006's must-catch set join it. A live run costs about $0.10 for 50 questions and needs Kay's OK (ADR-0012).

### NOT: card matching measured on the draft cards (2026-11-16)
- `scripts/ephemeral/2026-11-16-card-match-calibration.ts`, $0. Each test question was held out of its own card. Search alone ranked the right card first for 45 of 79 questions, in the top 3 for 62, and in the top 5 for 67. Off-topic questions scored at most 2.8; the highest-scoring wrong first place was 7.1. So search shortlists and the model picks (QST-KB-CARD-USE A), and the score alone decides only when the pick call fails, at 8 or above. To be re-run on the blind redraft.

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

### Chosen: C (topic cards for common questions, passages for the rest), with A (the sponsor approves every card)

**Rationale**: as in the two Recommendations. The first live test's misfires came from raw chunks, and the FAQ-shaped passages worked. Capping cards at the common topics keeps review to one sitting. The raw-passage fallback keeps Kay's earlier "entire ADA material" coverage (ADR-0005).

**What this means in the design**:
1. **Cards are data with an approval state.**
   - Each card has: topic, plain-language text, source passage ids, `status` (draft or approved), `approved_by`, and `approved_at`.
   - Search sees approved cards only.
   - Editing a card's text sends it back to draft.
   - Card text is ADA-derived, so it stays out of the public repo, like `kb/out/`.
2. **Drafting is offline, and numbers are checked mechanically.** `kb:synthesize` drafts one card per topic from that topic's passages, then rejects any card with a number that doesn't appear in its sources (the answer guard's rule, applied at build time).
3. **Review is a document the sponsor reads.** `kb:review` writes each card beside its source passages, and approvals are recorded per card.
4. **Retrieval goes cards first, and a matched card is shown as written** (QST-KB-CARD-USE: A). *Iteration 14 (QST-KB-RAG-FIRST, Kay: "try c first")*: **paused for a RAG-only trial.** The card code stays, switched off by `CARDS_PAUSED` in `src/lib/chat/prompts.ts`; the app doesn't even load cards while paused.
   - Search shortlists about 3 approved cards.
   - The AI returns only a card id or "none", and code checks that the id is on the shortlist.
   - The patient sees that card word for word, with its sources.
   - With "none", or no approved card, the turn falls back to raw passages and today's AI-written, guarded answer.
   - If the card-picking call fails, the top-scoring card is shown only above a score threshold; otherwise the raw-passage path runs.
5. **Dose content keeps its rules.** No card gives dose instructions (the answer guard checks every card). Dose-tagged passages stay verbatim-only (ADR-0005). ~~A topic whose sources are mostly dose-tagged gets no card.~~ *Iteration 6 (QST-KB-DOSE-CARDS: B)*: the tag count doesn't decide; the sponsor decides card by card, and the review document marks cards that cite dose-tagged passages for closer reading.
6. **Iteration 6: the sponsor's source set, with the book under a numbers rule** (QST-KB-BOOK-ROLE: A). Sources are the two ADA guides and *Bright Spots & Landmines*, each tagged with source, year, and diabetes type. *Iteration 9 (QST-KB-BOOK-RECHECK: A)*: the book stays in runtime search even though its passages are mostly first-person; the code holds the safety line, and TD-6 (book chunk quality) is medium priority.
   - The book is searched like the ADA guides, but it is never the authority on numbers. Code enforces this: a number in an answer must appear in a cited ADA passage (or the patient's own message), and citing the book alone doesn't count.
   - A book passage is never shown word for word: not as a fallback, not as an urgent passage, not as a dose passage. Its voice is first-person, and copyright allows only brief quotes.
   - Dose-tagged book passages never reach the model, as with ADA.
7. **Iteration 6: the care-team FAQ is held out everywhere for the first pass** (QST-KB-HOLDOUT-SCOPE: A). It leaves `kb_chunks` and card drafting, and is used only to evaluate: coverage (does a card exist for each FAQ question?) and agreement (do card and FAQ agree on facts and numbers?). ~~It returns as a source after the comparison.~~ *Iteration 10 (QST-KB-FAQ-RETURN, Kay: "my idea is to see whether we can answer the faqs well without the current FAQ")*: the FAQ stays held out. The question is no longer only card coverage but whether the whole assistant (cards, then AI-written answers from the ADA guides and the book) answers the FAQ questions well from the sponsor material alone. The FAQ answers are the clinical reference for judging that. *Iteration 11 (QST-KB-FAQ-EVAL: A)*: test as is, one baseline run of the 13 questions through the real turn (`kb:eval-faq`), no gap cards first.
8. **Iteration 6: all cards are redrafted blind** (QST-KB-REDRAFT: A). A drafting agent that has never seen the FAQ, the old drafts, or the FAQ-derived topic list writes them from the new passages. The topic list comes from Kay's predictable topics (lows, carb counting, sick days, foot care, exercise, medication timing) plus the ADA guides' own sections.

**Trade-offs accepted**: cards depend on the sponsor's time, and nothing goes live until they approve it. Until then, the assistant answers from raw passages as it does today. *Iteration 6*: during the first pass, testers lose the FAQ's 13 passages and the six ADA handouts. The book's numbers never reach a patient on the book's authority alone, even where they are right.

---

## Open Follow-ups

- [ ] **A doubt worth keeping:** if approved cards cover the common questions well, does the runtime answer model still earn its place for those questions? Showing the matching approved card word for word would be safer, and possibly just as good, for this audience. The model's job would shrink to choosing the card and handling the long tail. Revisit after QST-KB-SHAPE.
- [ ] Log which card or passage answered each turn, so the topic list can be checked against what testers actually ask. That's the falsifier for C.
- [ ] TD-5 (stale chunk headings) needs fixing under every option, because raw passages stay as the fallback (C), the provenance (B), or the whole knowledge base (A, D).

---

## Action Items

- [ ] Draft the topic list (20–30) from the care-team FAQ questions, the clinic's triage workflow, and the first testers' questions; Kay to confirm the list. Owner: Nibble, then Kay
  - NOT (2026-11-14): Kay asked to see topics and answers directly, so Nibble hand-drafted 30 cards. That cost $0, with no model run.
    - Local file `kb/out/cards-draft.json`, and the review document `kb/out/cards-draft.md`, both gitignored.
    - All 30 pass the answer guard (`scripts/ephemeral/2026-11-14-cards-check.ts`).
    - Gaps found: the before-meal and A1C targets were lost in PDF extraction, and there's no daily foot-care content.
    - The live drafting run may now be unnecessary. The hand-drafted cards can go straight to review.
- [ ] Build `kb:synthesize`, with its number check, and `kb:review`; add a cards table (draft or approved, approver, date) with search limited to approved cards. Owner: Nibble
- [ ] Live drafting run (about $0.05, Haiku 5.5): needs Kay's OK first (ADR-0012). Owner: Kay to approve, then Nibble
- [ ] Sponsor reviews and approves cards. Owner: Kay's clinical sponsor
- [ ] Fix TD-5 (stale chunk headings): the raw passages remain the fallback. Owner: Nibble
- [ ] (Iteration 5) Update `kb/manifest.json` to the sponsor's set: the six handouts out, the book in with its own source label, year and diabetes-type tags; the FAQ held out per QST-KB-HOLDOUT-SCOPE. Rebuild locally ($0), compare old and new passages, and check how the book chunks. Owner: Nibble, after Kay's answers
- [ ] (Iteration 5) Re-check approved cards on every load: a card goes back to draft when its source passages change, so a future knowledge-base update can't leave approved text citing different passages. Owner: Nibble
- [ ] (Iteration 5) Add a reading-level measure (6th–8th grade) and a book-vs-ADA number-conflict report to the card check. Owner: Nibble
- [ ] (Iteration 5) After the blind draft: compare cards with the clinical FAQ (coverage, agreement on facts and numbers) and give the sponsor the differences. Owner: Nibble, then Kay's clinical sponsor
- [ ] (Iteration 14, QST-KB-EVAL-NEXT: D) Ask the clinical sponsor for nutrition material: 7 of the 13 FAQ questions are nutrition, and the sponsor's set answers them thinly or not at all (protein shakes, supplements, bedtime snack, affordable food, fruit portions, snacks, hunger between meals). Owner: Kay
- [ ] (Iteration 14) Apply migration 0003 so passages carry their diabetes type in production (until then the app loads passages without it and search doesn't rank by type). Owner: Nibble, after Kay's OK and the rls-dev test credentials

---

## Iterations

### Iteration 1 (2026-11-14)
- Trigger: Kay's question after the first live chats (quoted under Originating Context)
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Options drawn up as raw (A), cards only (B), cards plus raw fallback (C), and tags only (D). Review rule asked separately. Evidence from the first live test recorded.
- Outcome: Draft (two questions open)

### Iteration 2 (2026-11-14)
- Trigger: Kay answered QST-KB-SHAPE: C and QST-KB-REVIEW: A
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision filled in: cards as data with an approval state; offline drafting with a build-time number check; a review document; cards-first retrieval with raw fallback; dose rules unchanged. Action items listed.
- Outcome: Draft → Accepted

### Iteration 3 (2026-11-14)
- Trigger: Kay asked "so when will the education material be queried"
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Query order spelled out:
  - emergency and dose questions don't search;
  - urgent questions get the urgent card plus the matching raw "what to do" passage;
  - ordinary questions search approved cards first, then raw passages if no card fits;
  - until cards are approved, everything uses raw passages.
  
  New question QST-KB-CARD-USE asks what the patient sees when a card matches.
- Outcome: Accepted (one question open)

### Iteration 4 (2026-11-14)
- Trigger: Kay answered QST-KB-CARD-USE: A
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision item 4 now reads: a matched card is shown as written; the AI only picks the card id; raw passages and AI-written answers remain for questions no card covers.
- Outcome: Accepted (no questions open)

### Iteration 5 (2026-11-16)
- Trigger: Kay: "connect the topic cards", then "the knowledge base is updated". Checking the Drive folder found the six ADA handouts gone and *Bright Spots & Landmines* added. Kay: the current materials come from the clinical sponsor; the team FAQ is held out at first pass, a FAQ layer is built from the material on hand and compared with the clinical version. Kay also pasted a proposed approach (Supporting Materials).
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - Card wiring paused before any database change. Code for the card step exists, uncommitted (`src/lib/chat/cards.ts`, the card step in `turn.ts`). It's mechanism only: inert with no approved cards, and independent of which sources the cards come from.
  - Recorded the update, the mapping of Kay's approach, and the card-matching measurement.
  - Four new questions: QST-KB-BOOK-ROLE, QST-KB-HOLDOUT-SCOPE, QST-KB-REDRAFT, QST-KB-DOSE-CARDS.
- Outcome: Accepted (four questions open)

### Iteration 6 (2026-11-16)
- Trigger: Kay answered QST-KB-BOOK-ROLE: A, QST-KB-HOLDOUT-SCOPE: A, QST-KB-REDRAFT: A, QST-KB-DOSE-CARDS: B (all as recommended).
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision item 5 amended (sponsor decides dose-territory cards); items 6–8 added (book under a numbers rule and never verbatim; FAQ held out everywhere for the first pass; blind redraft).
- Outcome: Accepted (no questions open)

### Iteration 7 (2026-11-16)
- Trigger: the first build of the sponsor's set met QST-KB-BOOK-ROLE's own "If wrong" condition.
- Contributors: Nibble (Claude Opus 5.5)
- Changes:
  - Built (commits `38e7fb6` to `445d781`): the source set and rebuild (ADA ids unchanged); the ADA-numbers rule in the guard; book passages never shown word for word; the card step in the turn; `kb:cards:check`, `kb:faq-compare`, `kb:cards:load`, `kb:cards:approve`; migration 0003 (written, not applied to any branch).
  - A regression found while testing: card scores depended on how many cards were approved. Fixed by taking word rarity from the whole knowledge base. Cutoffs recalibrated: shortlist floor 2.5, fallback 13.
  - Blind redraft started with a drafting agent restricted to `kb/out/passages.json`, the guard, and the checker.
  - New question QST-KB-BOOK-RECHECK.
- Outcome: Accepted (one question open)

### Iteration 8 (2026-11-16)
- Trigger: the blind redraft finished and was compared with the clinical FAQ.
- Contributors: Nibble (Claude Opus 5.5); the blind drafting agent (Claude Opus 5.5)
- Changes: recorded the comparison and the recalibration (fallback cutoff 16); new question QST-KB-FAQ-RETURN.
- Outcome: Accepted (two questions open)

### Iteration 9 (2026-11-16)
- Trigger: Kay answered QST-KB-BOOK-RECHECK: A (against the recommendation, B).
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision item 6 notes the book stays in runtime search; TD-6 (book chunk quality) raised to medium priority.
- Outcome: Accepted (one question open: QST-KB-FAQ-RETURN)

### Iteration 10 (2026-11-16)
- Trigger: Kay answered QST-KB-FAQ-RETURN with an override: "my idea is to see whether we can answer the faqs well without the current FAQ".
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision item 7 amended: the FAQ stays held out and becomes the reference for testing the whole assistant. New question QST-KB-FAQ-EVAL (how to run that test, and the spend).
- Outcome: Accepted (one question open)

### Iteration 11 (2026-11-16)
- Trigger: Kay answered QST-KB-FAQ-EVAL: A (recommendation was C) and approved the run ("yes").
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision item 7 notes the baseline-only test. Results go under Supporting Materials when the run finishes.
- Outcome: Accepted (no questions open)

### Iteration 12 (2026-11-16)
- Trigger: the baseline run finished (approved by Kay; $0.0044).
- Contributors: Nibble (Claude Opus 5.5)
- Changes: results recorded under Supporting Materials; new question QST-KB-EVAL-NEXT (four fixes).
- Outcome: Accepted (one question open)

### Iteration 13 (2026-11-16)
- Trigger: Kay, after seeing the cards and the side-by-side answers: "i think the cards are poorly written", then "why do we have to use the card approach instead of rag? i thought we'd use these before faq" (pointing at the approach's first three parts), and "show me in adr panel".
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - Two new questions: QST-KB-RAG-FIRST (what "before" means for the build) and QST-KB-RAG-FIXES (which RAG fixes, then a RAG-only re-run).
  - QST-KB-EVAL-NEXT deferred behind them.
  - Why the cards read poorly (Nibble's count of the 30 blind cards): topics came from the sources' subjects, not patients' questions. Only 1 of 30 is phrased as a question, 13 combine two or more subjects, 20 end by deferring to a professional, and 13 contain any number.
- Outcome: Accepted (two questions open, one deferred)

### Iteration 14 (2026-11-16)
- Trigger: Kay answered QST-KB-RAG-FIRST: "try c first" (RAG only), QST-KB-RAG-FIXES: B (diabetes type in search; no re-run chosen), and QST-KB-EVAL-NEXT: D (ask the sponsor for nutrition material).
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - Cards paused (`CARDS_PAUSED`), not deleted, as a trial. Decision item 4 notes it.
  - Diabetes type in search, as a boost to the patient's own type rather than a demotion of the other: the demotion was measured to hand first places to the book (Supporting Materials).
  - Passage loading survives the deploy-before-migration window.
  - `kb:eval-faq` follows the card switch and takes `--type`.
  - Two action items: the sponsor's nutrition material (Kay), and applying migration 0003 (Nibble, after Kay's OK).
  - No re-run: F wasn't chosen. The next run needs Kay's OK.
- Outcome: Accepted (no questions open)

### Iteration 15 (2026-11-16)
- Trigger: Kay: "ok" to applying migration 0003 on rls-dev and to the RAG-only re-run.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - Migration 0003 applied to rls-dev; approval rules verified there. Data API access tests not run (no credentials).
  - RAG-only re-run ($0.0089) compared with the card baseline.
  - Bug fixed: a "no information" reply with citations was shown as a sourced answer (`1bcfef9`).
  - Cause of the "sugar over 250" miss found: dose tag too broad, plus TD-5.
  - New question QST-KB-RAG-NEXT.
- Outcome: Accepted (one question open)

### Iteration 16 (2026-11-16)
- Trigger: Kay, on QST-KB-RAG-NEXT: "can we drop the dose-related constraint for testing? tbh it was set up by us not the clinical sponsor". Chose rule 1 only, test runs only, with the re-run.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes:
  - `hideDosePassages` per turn (default on: the live app is unchanged); `kb:eval-faq` turns it off (`1730c26`).
  - Found and fixed a hidden-passage test that never reached the model.
  - Third run recorded (no dose advice written; 2 / 5 / 3 / 3).
  - New question QST-KB-RAG-ROUND3.
- Outcome: Accepted (one question open)

---

## Links

- Related ADRs:
  - [ADR-0005](0005-diabetes-education-bot-architecture-and-answer-path.md): answer path, RAG, verbatim dose passages. QST-DIAB-ANSWER-PATH (curated cards, superseded by Kay's "entire ADA material") and QST-WHICH-APPROACH-SHOULD-I: C are the decisions this ADR refines.
  - [ADR-0006](0006-diabetes-education-bot-urgent-situation-triage-and-escalation.md): iteration 7, one question one reply
  - [ADR-0012](0012-model-choice-under-a-15-dollar-openrouter-budget.md): budget, live runs need Kay's OK
- Related debt: TD-5 in `docs/TECHNICAL-DEBT.md`
- Related code: `src/lib/kb/chunk.ts`, `kb/build.ts`, `kb/load.ts`, `src/lib/chat/retrieve.ts`
