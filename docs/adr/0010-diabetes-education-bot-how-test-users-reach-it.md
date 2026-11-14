<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0010: Diabetes education bot — how test users reach it

- **Date**: 2026-11-14
- **Iteration**: 1
- **Status**: Draft
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Sharing the GitHub Pages link doesn't give a test user a working bot as currently designed. The knowledge base isn't on the site, they'd need an OpenRouter key, and their sessions stay in their own browser where the team can't see them. Proposed: moderated sessions on the team's device for older test users, and the shared link only for teammates.

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-14):

> so how does it work if a share the github page to a test user

**Agency Grant**: Explain and recommend.

---

## Explicitation

What a test user gets from the shared link, given the decisions so far:

| Piece | What happens for a remote test user | Why |
|---|---|---|
| The app itself | Loads fine | Public site (ADR-0002) |
| Demo patients | Load fine, *if* the dataset licenses allow redistribution | ADR-0009. Otherwise the glucose data isn't on the site either |
| Help button, 911 demo mode | Works, and dials nothing | ADR-0006, QST-TRIAGE-DEMO-DIAL: B |
| **AI model calls** | **Blocked until they paste an OpenRouter key** | ADR-0001: the key is the user's own and never in the build, because the bundle is public and a key in it would leak |
| **Knowledge base** | **Missing.** The bot answers "I don't have information on that" to everything | ADR-0005: ADA material stays out of git and the public site until redistribution is confirmed. It's loaded from the team's Drive on the demo device |
| **Their sessions and summaries** | **Stay in their browser.** The Care team inbox is in *their* browser, so the team never sees what happened | ADR-0008, QST-HANDOFF-STORAGE: A (one device, no backend) |
| Real health information | They may type their own, and it goes to OpenRouter | ADR-0005's notice must be on screen |

So a shared link gives a remote tester a bot with no knowledge and no key, whose results the team can't see. Each gap comes from a decision that was right for a single-device demo.

**Assumptions**:

- "Test user" could mean a teammate or classmate (technical, can handle files and keys) or an older adult from the target audience (the people the UI is designed for).
- Testing with older adults recruited for the study may need an IRB determination (ADR-0005, Open Follow-ups).

**Confirm**: Kay. Which kind of test user, and are they remote or in the room? See QST-TEST-ACCESS.

---

## Questions

### QST-TEST-ACCESS: How do test users get a working bot?
- Status: unanswered
- Why asking: Kay asked what happens when the GitHub Pages link is shared with a test user. As designed, a remote user gets no knowledge base (ADA material is kept off the public site), needs their own OpenRouter key (ADR-0001: no key in the public bundle), and their sessions stay in their own browser, invisible to the team (ADR-0008: one device, no backend). The target users are older adults with low vision and limited tech literacy.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Moderated sessions, plus the link for teammates**: Older test users try the bot on the team's device, with the knowledge base loaded and the key set up, while a teammate watches and takes notes. Teammates who test remotely get the knowledge-base files privately (a Drive share), import them with a file picker, and paste their own key. Nothing about the architecture changes.
- **B — Remote link, with a capped key and session export**: Each tester gets a dedicated OpenRouter key with a low credit limit, pasted once. The knowledge base is bundled into the site, which **requires confirming ADA material may be redistributed publicly**. A "Download my session" button saves the conversation and summary as a file the tester emails back.
- **C — Remote link, with a small backend**: A serverless function holds the key (the browser never sees it), a hosted database stores each session for the team, and the knowledge base is served only after login. Testers just open the link. This amends ADR-0001 (no backend) and ADR-0008 (one device), and it's real infrastructure to build and secure.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**A — Moderated sessions, plus the link for teammates.** *Rationale*: For the people this bot is designed for, moderated testing is the better method anyway. Asking an older, low-tech user to paste an API key or email back a file tests the setup, not the bot. And watching where they hesitate is the finding you're after. A needs no infrastructure, keeps the ADA material off the public site, and fits the one-device design already decided. B depends on a redistribution permission nobody has confirmed. C is a project of its own, and once real testers are typing, it holds data that drifts toward PHI. *Confidence*: 0.7 — because if the course requires unmoderated remote testing at scale, A can't deliver it. *If wrong*: if testers must be remote and unmoderated, flip to **B** once ADA redistribution is confirmed, or to **C** if it isn't.

**ANS:** (by Kay)
[Fill this in]   <!-- literal placeholder — parser-significant, do not paraphrase -->

---

## Trade-offs

- **A doesn't scale.** Each session takes a facilitator's time, and a class project rarely has more than a handful of sessions anyway.
- **Any remote option spends money unattended.** Each tester's model calls cost credit. A per-key cap (B) or a server-side budget (C) is required, as is the 8-round loop cap from ADR-0003.

---

## Open Follow-ups

- [ ] **A test protocol for moderated sessions**: tasks to try (ask a nutrition question, report a high reading, ask for a dose), what to observe, and consent wording. This should be checked against course or IRB guidance before recruiting.
- [ ] **A notice on the public site** that the link alone is a non-working preview ("This demo needs setup; contact the team"), so a stranger who finds it isn't left with a broken bot.

---

## Iterations

### Iteration 1 (2026-11-14)
- Trigger: Kay asked how sharing the GitHub Pages link works for a test user
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Mapped what a remote tester gets, and posed QST-TEST-ACCESS.
- Outcome: Draft

---

## Links

- Related ADRs: ADR-0001 (key in the browser), ADR-0003 (round cap), ADR-0005 (knowledge base off the public site; real-PHI notice), ADR-0006 (demo mode), ADR-0008 (one-device storage), ADR-0009 (dataset licenses)
