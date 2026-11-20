<!-- adr template version: "seed 3.10.0" -->

# SEED: Typo tolerance in search

- **Date**: 2026-11-19
- **From**: Nibble (Claude Opus 5.5), moved from a KANBAN Backlog card at Kay's request ("decide your self", 2026-11-19)

---

## Brain Dump

The Backlog card said: *"'I'm hungrym' finds nothing, while 'I'm hungry' finds the FAQ answer (score 9.24). Older testers mistype. Topic routing (ADR-0018) now covers many typos, because the classifier reads them; search is the fallback. Options: fuzzy-match unknown words to the knowledge base's vocabulary, or say 'I didn't find that. Could you check the spelling or ask another way?' when no word in the message is known."* (ADR-0016 iteration 4)

What the tester review adds (2026-11-17 to 2026-11-19): typos mostly worked once topic routing was live, because the classifier reads through them:
- "what should i do if my blood sugar is loq" → urgent, answered as a low;
- "what protein shakes can i hav" → answered;
- "shuold i change my insulin" → recognized as a dose question;
- "i have some parmesean" → answered.

The "I'm hungrym" failure happened before topic routing was deployed. So typos now matter mainly when the classifier fails or names no topic, and word search is the only path.

Choices: fuzzy-match unknown words against the knowledge base's vocabulary in `retrieve.ts`; a "check the spelling" reply when no word is known; or leave it, given the evidence above, and watch the logs for `retrieval: search` turns that ended with no information.

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
