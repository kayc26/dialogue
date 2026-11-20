<!-- adr template version: "seed 3.10.0" -->

# SEED: After an escalation — checking in, and talking about someone else

- **Date**: 2026-11-19
- **From**: Nibble (Claude Opus 5.5), two KANBAN Backlog cards combined, at Kay's request ("decide your self", 2026-11-19)

---

## Brain Dump

The two Backlog cards (both ADR-0006):
- *"After an escalation, check in on the next turn ('Are you feeling better?')."*
- *"Caregiver wording for reports about someone else ('my wife won't wake up')."*

They belong together because both are about what the bot says around a red flag.

**Checking in.** In Kay's test on 2026-11-18, with Helen ("My blood sugar is 412 and I'm throwing up"), the emergency was handled: 911 first, no model call. The next three turns (metformin, A1c at discharge, carb counting) were answered as if nothing had happened. Meanwhile the background monitor re-flagged "emergency" on two of them, which was logged but not shown, because the session was already at emergency. A patient who has just reported vomiting with a 412 probably should be asked how they are before getting a carb-counting lesson. Questions: check in only after urgent and emergency, or after check-ins too? Fixed wording, or written by a model? Once, or until they answer? How does it fit "one question, one reply" (Kay, 2026-11-14)?

**Caregiver wording.** The help text speaks to "you" ("If you feel confused…"). When the message is about someone else ("my husband won't wake up and his sugar was low", which is a real test case), "you" is the wrong person, and the right advice changes (the reader can call 911 and give glucagon; the patient can't). Questions: detect third person by code ("my wife/husband/mom/dad/son/daughter…", "he/she") or by the classifier? Separate approved wording for caregivers, or one wording that works for both?

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
