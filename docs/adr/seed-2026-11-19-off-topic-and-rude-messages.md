<!-- adr template version: "seed 3.10.0" -->

# SEED: Off-topic and rude messages get "I don't have information on that"

- **Date**: 2026-11-19
- **From**: Nibble (Claude Opus 5.5), from the tester review of 2026-11-19 (not on KANBAN before), at Kay's request ("decide your self")

---

## Brain Dump

Seen in the logs (2026-11-17 to 2026-11-19, `scripts/ephemeral/2026-11-19-tester-sessions-review.ts`):
- **The only tester so far**: 4 of 8 turns ended in the no-information reply: "can we get married", "bruh", "i didnt do my dishes yet", and "if i smoke some marijuana can i eat more".
- **Kay's tests**: "love u", "kiss kiss", and two insults got the same reply.
- **What the patient reads every time**: "I don't have information on that. I can answer general questions about eating, blood sugar, and everyday diabetes care. For anything else, your care team can help."
- **The model's own friendlier drafts were blocked**, because they cite nothing (for example "Thank you, that's kind of you to say. I can help with questions about diabetes…"). That is the guard working as designed (ADR-0005).

Small talk already has fixed, approved replies for greetings, thanks, goodbyes, and "what can you do" (ADR-0016, `src/lib/chat/social.ts`). Off-topic chatter, affection, and insults aren't covered, so they fall through to the knowledge base and come back as "no information", which reads like a malfunction rather than a redirect.

Not all of these are the same kind of message:
- **Chatter and affection** ("bruh", "love u", "can we get married"): a short, warm redirect would fit.
- **Insults**: a calm, neutral redirect. No lecture.
- **A real health question the knowledge base doesn't cover** (the marijuana one): "no information, ask your care team" is actually the right answer here. It should stay.

Choices: more fixed intents in `social.ts` with approved replies (code, no model, like greetings); or let the model write a one-line uncited redirect, checked the way clarifying questions are (ADR-0018 iteration 5); or leave it, since it's mostly testers poking at the bot. Real patients may still type "thank you dear", "you're useless", or "I'm so tired of this", the last of which is a distress signal, not small talk, and triage must keep seeing it first.

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
