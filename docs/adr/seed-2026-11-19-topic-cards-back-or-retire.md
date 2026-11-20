<!-- adr template version: "seed 3.10.0" -->

# SEED: Bring topic cards back, or retire them

- **Date**: 2026-11-19
- **From**: Nibble (Claude Opus 5.5), moved from a KANBAN Backlog card at Kay's request ("decide your self", 2026-11-19)

---

## Brain Dump

The Backlog card said: *"Bring topic cards back, or retire them. Paused since 2026-11-16 (`CARDS_PAUSED`). The card code and pipeline stay in place. If approved cards cover the common questions, does the answer model still earn its place for them?"* (ADR-0013)

What exists:
- `kb_cards` table with a database trigger that keeps approvals honest (any text or source change sends a card back to draft), plus loader and approval scripts (`kb/cards-*.ts`).
- `src/lib/chat/cards.ts`: search shortlists 3 cards, a model picks one or "none", code checks the pick. In calibration, the right card was in the top 3 for 94 of 120 held-out questions.
- Paused by Kay on 2026-11-16 ("try c first", QST-KB-RAG-FIRST): the trial answers from passages only.

What has changed since the pause:
- ADR-0018: answers now read whole curated topic sections, and Kay liked the result live.
- In the tester review, "What fruit can I eat?" was answered consistently across six sessions, almost word for word from the care team's FAQ (`team-faqs-005`). Passage-based answers may already give much of what cards promised for common questions.
- Cards' unique strengths remain: no model writes the text, the sponsor approves it word for word, and it costs one small pick call.
- The clickable-terms seed (2026-11-20) may want the same approval pipeline for a glossary, which is a reason not to delete it outright.

Choices as I see them: bring cards back for a small set of top questions; retire the card path but keep the approval pipeline for a glossary; or keep everything paused until testers' questions show where passage-based answers fall short.

---

**Model Response Request:**
<!-- literal sensor block — parser-significant: tooling reads these exact checkbox labels as the seed's declared lifecycle state; do not reword them -->

- [ ] Chunk this into ADRs (I'm ready to formalize)
- [ ] Iterate with me (keep exploring)
- [ ] Structure in place (organize but don't split)

---

## Thread

*(Empty: waiting for Kay to tick a box above.)*

---

**Instructions for Model:** Copy everything from "Model Response Request" through the final `---` to the end of your response.

---

## Derived Into

*(This seed has not yet been chunked into ADRs)*   <!-- literal placeholder — parser-significant: its presence means un-chunked; replace the line with the ADR list when chunking, never reword it in place -->
