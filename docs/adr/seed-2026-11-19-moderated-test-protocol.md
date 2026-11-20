<!-- adr template version: "seed 3.10.0" -->

# SEED: A protocol for moderated test sessions

- **Date**: 2026-11-19
- **From**: Nibble (Claude Opus 5.5), moved from a KANBAN card at Kay's request ("decide your self", 2026-11-19)

---

## Brain Dump

The KANBAN card said: *"Test protocol for moderated sessions: tasks (nutrition question, high reading, dose question), what to observe, consent wording."* (ADR-0010). A related item in Waiting: ask course staff whether testing with older adults needs an IRB exempt determination; the current testers are classmates.

What the first unmoderated testing showed (review of 2026-11-17 to 2026-11-19, `scripts/ephemeral/2026-11-19-tester-sessions-review.ts`):
- Only 1 of 4 testers has used the site so far (8 turns in about 2 minutes). The other 3 have no sessions.
- That tester explored the edges rather than tasks: "can we get married", "bruh", sour candy, "I didn't do my dishes yet". Useful for robustness, but it says little about whether a patient can get help.
- So unmoderated use alone won't tell us whether the core tasks work. That's the case for a moderated protocol.

Things a protocol would need to settle:
- **Tasks**: for example a nutrition question, a high reading, a low with symptoms, a dose question, reading back one's own plan. Which demo patient for each task (Dorothy, Robert, Helen, Mei, George)?
- **What to observe**: do they find "Get help now"? Do they understand the dose refusal? Do they notice or use the sources? Do they trust the answer? How long do they take?
- **Method**: think-aloud or not; who moderates; screen recording or notes only.
- **Consent wording**: classmates now. Older adults later depend on the IRB answer (Waiting).
- **Data**: what is kept, and that testers must not type real health information (the sign-in screen already says so).

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
