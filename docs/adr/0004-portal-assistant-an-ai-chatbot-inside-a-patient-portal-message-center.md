<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0004: Portal assistant — an AI chatbot inside a patient-portal message center

- **Date**: 2026-11-12
- **Iteration**: 2
- **Status**: Accepted
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: Kay wants Harness's front end to be a chatbot in a patient-portal Message Center (the screenshot was MyChart). A mockup exists. Before building, decide what is being built and what data it may ever touch.

---

## Originating Context

**Source**: Human prompt (Kay, 2026-11-12), with a screenshot of the MyChart Message Center (Penn Medicine's instance of Epic's patient portal):

> I'd like my front end to be a chatbot on this, could you mock it up?

**Mockup**: `docs/mockups/portal-assistant.html`. It is a static page with fictional data and **placeholder branding**. The layout mirrors the portal's patterns (Message Center nav, conversation list), and adds an "Ask the assistant" entry, an assistant thread pinned in Conversations, a visible tool step (`search_messages`), citation chips linking answers to the source message, reply drafts that are never auto-sent, a "Send to a person" handoff, and a not-medical-advice banner.

**Agency Grant**: Mock it up; recommend.

---

## Explicitation

**What I understand**:

1. **"On this" could mean three different projects.** It could be a design mockup, Harness restyled as a portal-like assistant over demo data, or a real assistant connected to a real portal. They differ by orders of magnitude in effort, permissions, and risk.
2. **Real portal data is health data.** Harness sends everything in a conversation to OpenRouter and from there to a model provider, using a personal key, with no agreement covering health information (HIPAA requires a business associate agreement with any vendor that handles it on a covered entity's behalf). A real integration would also need the portal vendor's APIs (for Epic, SMART on FHIR) and the health system's approval. None of that is reachable from a browser-only page on GitHub Pages.
3. **Branding is not ours to use.** The mockup deliberately avoids the MyChart, Epic, and Penn Medicine names and logos. A page that looks like a real health system's portal, hosted publicly, could be mistaken for it.

**Assumptions**:

- This is for a course (CIS7000) or a portfolio, not a deployment for patients.
- The screenshot's real content (sender name, message text) stays out of the repo. The mockup uses invented content.

**Confirm**: Kay. Which of the three readings in point 1 did you mean?

---

## Questions

### QST-PORTAL-TARGET: What should "a chatbot on this portal" actually become?
- Status: answered
- Why asking: Kay asked for Harness's front end to be a chatbot inside a patient-portal Message Center (the screenshot was MyChart, which Penn Medicine runs on Epic's software). A static mockup with placeholder branding and fictional data is in `docs/mockups/portal-assistant.html`. The next step depends on whether this stays a design, becomes a working demo, or aims at the real portal, which differ hugely in effort and in what data they touch.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Design mockup only**: Keep the static mockup as the deliverable, for a presentation or a design critique. Iterate on its layout and copy, but build no behavior.
- **B — Portal-style Harness over a demo inbox**: Restyle Harness into this layout and give it a fictional inbox (a few sample conversations shipped with the app), plus a `search_messages` tool so the agent loop really searches, cites, and drafts replies. A working, honest demo of the idea, with real models and fake data, deployable to GitHub Pages.
- **C — Real portal integration**: An assistant that reads the user's actual portal messages. This needs the vendor's API access (Epic SMART on FHIR), the health system's approval, a backend, and an LLM provider covered by a HIPAA business associate agreement. It's outside Harness's architecture (browser-only, personal key, ADR-0001) and outside what a student project can get approved quickly.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-12)

**B — Portal-style Harness over a demo inbox.** *Rationale*: B turns the mockup into something that works, using everything already built: the agent loop, tool cards, and sanitized rendering (ADR-0003). It adds one tool (`search_messages`) over data we invent, so the citation and "draft, never send" patterns in the mockup become real behavior that can be tested. A stops before showing the idea works. C needs approvals and a backend that the current architecture (ADR-0001: no server, personal key) rules out. *Confidence*: 0.65 — because it depends on what this is for, which I'm inferring from the course context. *If wrong*: if this is for a design or UX assignment, flip to **A**. If Kay has a sanctioned path to real portal data (for example, a sandbox from the course or the vendor), flip to **C** with a new ADR for the backend and data agreements.

**ANS:** (by Kay)
a

---

## Decision

**Chosen: A — Design mockup only** (Kay, 2026-11-14). `docs/mockups/portal-assistant.html` stays a static design artifact, and no message-center behavior gets built. Its layout becomes the shell for the diabetes education bot (ADR-0005, QST-DIAB-VS-PORTAL: B). That bot is the only working part (confirmed in ADR-0005, QST-DIAB-PORTAL-SHELL: A).

**Consequences**: The `search_messages` tool and the demo inbox from option B are not built. The follow-up below, about a theme or a route, no longer applies.

---

## Open Follow-ups

- [ ] Whatever the answer, Harness should warn against pasting real health information while it runs on a personal OpenRouter key. A one-line notice under the composer would do.
- [x] *(Moot: A was chosen.)* Under B: should the portal look replace Harness's current UI, or be a second "theme" or route? Decide when B is chosen.

---

## Iterations

### Iteration 1 (2026-11-12)
- Trigger: Kay's request and screenshot
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Mockup built (placeholder branding, fictional data); QST-PORTAL-TARGET posed with a recommendation
- Outcome: Draft

### Iteration 2 (2026-11-14)
- Trigger: Kay answered QST-PORTAL-TARGET: A
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision filled in. The mockup stays static and serves as the shell for ADR-0005's diabetes bot.
- Outcome: Draft → Accepted

---

## Links

- Mockup: `docs/mockups/portal-assistant.html`
- Related ADRs: ADR-0001 (browser-only, personal key: why C doesn't fit), ADR-0003 (agent loop and tools that B reuses)
