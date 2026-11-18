<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0004: Portal assistant — an AI chatbot inside a patient-portal message center

- **Date**: 2026-11-12
- **Iteration**: 4
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

### QST-PORTAL-BRANDING: Should the live portal shell look like PennChart?
- Status: answered — Kay replied "b" in chat; recorded by Nibble
- Why asking: Kay, on the deployed site (2026-11-14): "hmmm the background is not pennchart". The shell follows `docs/mockups/portal-assistant.html`, which copies the portal's *layout* (Message Center, Conversations, the assistant thread) but deliberately uses a placeholder brand (point 3 in the Explicitation above). The site is **public** (GitHub Pages) and has a **real sign-in form**. A page with Penn Medicine's or PennChart's look and a password box is the same thing a phishing page is: a Penn patient who lands on it could type their real Penn credentials. PennChart is Penn Medicine's brand, running on Epic's MyChart design.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Keep the placeholder look**: As built. The mockup's layout, neutral colors, and "Patient Portal (placeholder brand · demo)".
- **B — Closer to the portal, still unbranded**: Match PennChart's structure and feel more closely (header layout, icon style, spacing, a neutral blue palette), but no Penn or PennChart names, logos, brand colors, or fonts. The sign-in page keeps saying "Diabetes Education Assistant (demo)".
- **C — PennChart look-alike**: Penn Medicine and PennChart names, logos, and colors. Only with **written permission from Penn Medicine** (brand/communications and IT security, through the clinical sponsor), and only **hosted privately**, never on the public site, so the sign-in form can't be mistaken for Penn's.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Closer to the portal, still unbranded.** *Rationale*: The demo's point is that the assistant fits *inside* a patient portal, and B shows that as well as C does, without the two real risks of C: a public Penn-looking page with a password field, and using Penn's and Epic's marks without permission. A is fine too; B just closes more of the visual gap Kay noticed. I won't put Penn or PennChart branding on the public site with a sign-in form. *Confidence*: 0.75 — because how close is "close enough" for the class presentation is Kay's judgment. *If wrong*: if the clinical sponsor gets Penn's written OK for a Penn-branded demo, flip to **C** on private hosting (for example, local-only or behind a separate login), with the sign-in clearly labeled as the demo's own.

**ANS:** (by Kay, 2026-11-14)
b

---

NOT: Kay amended B the same day: "penn color is fine". The live shell now uses Penn Blue (#011F5B) and Penn Red (#990000). Still out: Penn Medicine and PennChart **names, logos, and fonts**. The brand stays "Patient Portal (placeholder brand · demo)", and the sign-in page stays "Diabetes Education Assistant (demo)". Built from the mockup's details: Home/Menu squares, avatar pill, "Learn more", conversation search and previews, the soft message area, chat bubbles, and the "Ask" composer. Static parts say they aren't in the demo. Checked in headless Chrome at desktop and narrow widths.

NOT: Kay, same day: "i want to keep the mock up's chatbox view". The assistant thread is now the mockup's chat window:
- **Header**: thread title and the AI bar.
- **Patient bar**: name, age, type, and latest glucose, with **My insulin**, which opens the read-back panel, and **Change patient**.
- **Messages**: a scrolling area on the soft background, with a welcome bubble and suggestion chips. Answers appear as white bubbles with 📄 source chips and "answered from N approved passages". The patient's messages are Penn Blue bubbles.
- **Composer**: the **Ask** bar pinned at the bottom.

The portal fills the screen height, and each pane scrolls on its own. The fixed "Get help now" button keeps clear of the Ask button: there's space on its right on desktop, and on phones it sits below the Ask row. On phones the footer, subtitles, and fine print are hidden so the chat keeps its space. Checked in headless Chrome at 1500×950 and 430×900, with no errors and no OpenRouter requests.

---

NOT: Kay, same day, with four screenshots of the real portal's message flow: "this is the current ui in mychart, and we will be non-urgent medical question". The real flow is:
1. Message Center (navigation, plus a wide conversation list), then **Send a message**.
2. A docked **"New message" window** at the bottom right, over a dimmed page: "What would you like to do?" (Schedule an appointment / Refill a medication / Billing assistance / **Contact your care team**).
3. A **messaging disclaimer**: not for emergencies; 911; confirm the message isn't urgent.
4. **"What type of medical question?"** (**Non-urgent medical question** / Prescription / Test results / Appointment / Attach document / Referral).

Decided by Kay: **the Diabetes Assistant is the "Non-urgent medical question" path.** The shell is rebuilt to that flow:
- The two-column Message Center replaces the three-column mockup layout.
- The other options are static ("not part of this demo").
- The disclaimer is in this project's own words. The real portal's text isn't copied, and there are no MyChart, Epic, or Penn names or logos (QST-PORTAL-BRANDING: B, with Penn colors).
- The fixed-rule triage still runs on every message: a person who confirms "not urgent" can still be wrong.

### QST-PORTAL-SHORTCUT: Keep a one-tap shortcut to the assistant, or only the real portal's four-step path?
- Status: answered
- Why asking: The real portal reaches a non-urgent medical question in four steps (Send a message → Contact your care team → disclaimer → question type). The original brief for the diabetes assistant (ADR-0005) asks for **minimal navigation depth** for older, low-tech-literacy users. The earlier mockup had a direct "✦ Ask the assistant" button.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Real path only**: The assistant is reachable only through the four steps, exactly like the real portal. It's the most faithful to the portal for the sponsor's review, and the hardest for older users.
- **B — Real path plus a shortcut**: The four-step path works as in the real portal, *and* a visible "Ask a non-urgent question" button in the Message Center jumps straight to the disclaimer step, then the assistant. The disclaimer is never skipped.
- **C — Shortcut only**: The assistant opens directly from one button, and the other steps aren't built.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**B — Real path plus a shortcut.** *Rationale*: B shows the sponsor exactly where the assistant would sit in the real portal, and still meets the minimal-depth requirement for the users the brief is about. The shortcut lands on the disclaimer, so the "not for emergencies" step always happens. *Confidence*: 0.7 — because whether a real portal would allow a shortcut button is the clinic's call, not ours. *If wrong*: if the sponsor wants a demo identical to the portal, flip to **A**. If user testing shows the four steps lose people, the shortcut is already there.

**ANS:** (by Kay)
c

---

NOT: Built (2026-11-14). The Message Center has one button, "✦ Ask a non-urgent question". It opens the Diabetes Assistant window directly. The Send a message menu, the disclaimer step, and the question-type list were removed. Without the disclaimer step, "not for emergencies" lives in the window's yellow banner, which is shown on every visit: "Messages are not for emergencies: use Get help now or call 911." This differs from my recommendation (B), which kept the disclaimer step on the shortcut. Kay chose fewer steps over that confirmation click.

NOT: Shortened (2026-11-17, Kay: "the current ui is a bit too wordy"). The banner is still the one place that carries the safety message. It now reads: "AI can be wrong. No medical advice or doses. Not for emergencies: use Get help now or call 911." The welcome bubble no longer repeats the dose and emergency lines. The fine print under the composer is gone: it repeated the banner, and its "can't see your health records" became untrue once the bot started reading the plan back (ADR-0020). Reply labels are shorter: "Quoted word for word", "From N approved passages", "Approved answer". Approved reply texts (escalation, dose refusal, small talk, no information) are unchanged.

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

### Iteration 3 (2026-11-14)
- Trigger: Kay answered QST-PORTAL-SHORTCUT: C
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: One button opens the assistant. The four-step portal path is removed, and the banner carries the emergency message. A dark-mode contrast bug in the portal shell was fixed at the same time (navy text on a dark background).
- Outcome: Accepted

### Iteration 4 (2026-11-17)
- Trigger: Kay: "the current ui is a bit too wordy"
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Repeated disclaimers removed from the chat window and the banner shortened. Reply labels, the patient-picker note, and the sign-in links were trimmed.
- Outcome: Accepted

---

## Links

- Mockup: `docs/mockups/portal-assistant.html`
- Related ADRs: ADR-0001 (browser-only, personal key: why C doesn't fit), ADR-0003 (agent loop and tools that B reuses)
