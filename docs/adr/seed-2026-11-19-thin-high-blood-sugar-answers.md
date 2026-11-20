<!-- adr template version: "seed 3.10.0" -->

# SEED: Answers about high blood sugar are thin

- **Date**: 2026-11-19
- **From**: Nibble (Claude Opus 5.5), moved from a KANBAN Backlog card at Kay's request ("decide your self", 2026-11-19)

---

## Brain Dump

The Backlog card said: *"Answers about high blood sugar are thin. Rule 1 hides dose-tagged passages from the model, and much of the ADA material on highs is dose-tagged. Loosening that needs Kay and the sponsor."* (ADR-0018, ADR-0005)

New since the card, and more pressing after ADR-0021:
- **The care team's own "What do I do when I have a high blood sugar (>250 mg/dL)?" (`team-faqs-008`) is tagged `dose_related`**, because it says to follow "your provider's instructions regarding diabetes medications or correction insulin". It contains no amounts. Because of the tag, the answer model never sees it.
- **The same holds for most of the high-blood-sugar section**: `ada-t2-guide-023` ("How should I manage my high blood glucose?") and `ada-t1-guide-027` and `-028` (ketones, DKA) are dose-tagged too. What's left for the model is mostly `team-faqs-009`, "Why is my blood sugar high?" (causes), plus "When to seek help". That is why "what do I do" answers about highs tend to lead with causes.
- **ADR-0021 (2026-11-19) made the written answer the whole urgent reply.** Before, a passage was quoted beside it (though never `team-faqs-008`; search picked a definition instead). Now `team-faqs-008` is quoted only when no written answer is shown. So the best "what to do" text the care team wrote rarely reaches the patient on an urgent high.

Directions to consider (all need Kay and the clinical sponsor):
- The sponsor reviews specific dose-tagged passages that name no amount (starting with `team-faqs-008`) and approves them as readable by the model. The guard still blocks dose advice in whatever the model writes (rule 2).
- Split passages at the next knowledge-base rebuild, so the dose sentence sits apart from the rest, which can then be untagged.
- For urgent highs only, quote `team-faqs-008` instead of a written answer (closer to ADR-0021's option A, which Kay did not choose).

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
