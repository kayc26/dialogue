<!-- adr template version: "adr 3.12.0" -->
<!--
adr teaching map: the example is not the teaching — these are the up-links from this file to what teaches its form; load them rather than winging it. (Sibling: the template-version marker dates the mold this file was minted from.)
  skill: adr-authoring
  mcp: adrs4ai
  plugin: adr@adrs4ai
-->

# ADR-0010: Diabetes education bot — how test users reach it

- **Date**: 2026-11-14
- **Iteration**: 8
- **Status**: Accepted
- **Deciders**: Kay, Nibble (Claude Opus 5.5)

**TL;DR**: The bare GitHub Pages link gives a tester no knowledge base, no model key, and no way for the team to see their sessions. Decided for a clinical sponsor plus teammates: Neon Postgres reached from the browser through its Data API, with sign-in and row-level security. That gives one shared care-team inbox and keeps the knowledge base private behind sign-in, with no server of our own. Each tester keeps their own capped OpenRouter key.

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
- Status: answered
- Why asking: Kay asked what happens when the GitHub Pages link is shared with a test user. As designed, a remote user gets no knowledge base (ADA material is kept off the public site), needs their own OpenRouter key (ADR-0001: no key in the public bundle), and their sessions stay in their own browser, invisible to the team (ADR-0008: one device, no backend). The target users are older adults with low vision and limited tech literacy.
- Need: pick a letter (or override — an answer in any shape is complete)

Options:
- **A — Moderated sessions, plus the link for teammates**: Older test users try the bot on the team's device, with the knowledge base loaded and the key set up, while a teammate watches and takes notes. Teammates who test remotely get the knowledge-base files privately (a Drive share), import them with a file picker, and paste their own key. Nothing about the architecture changes.
- **B — Remote link, with a capped key and session export**: Each tester gets a dedicated OpenRouter key with a low credit limit, pasted once. The knowledge base is bundled into the site, which **requires confirming ADA material may be redistributed publicly**. A "Download my session" button saves the conversation and summary as a file the tester emails back.
- **C — Remote link, with a small backend**: A serverless function holds the key (the browser never sees it), a hosted database stores each session for the team, and the knowledge base is served only after login. Testers just open the link. This amends ADR-0001 (no backend) and ADR-0008 (one device), and it's real infrastructure to build and secure.
- **D — Link plus a private setup kit, starting with a guided walkthrough** *(added in iteration 2, for testers who are only the clinical sponsor and teammates)*: Everyone opens the public link and sets it up once from a kit shared through the team Drive:
  - a personal OpenRouter key with a low credit limit, one per tester so each can be revoked;
  - **one knowledge-base bundle file** (the PDFs and FAQ already split into chunks by a team script), imported with a single file picker;
  - a **"Download my session"** button whose file the tester drops back into the team Drive.

  The sponsor's first session is a guided video walkthrough of the six demo patients, using both the patient and the care-team views. After that, the sponsor explores alone. No backend, and the ADA material never touches the public site.
- **E — Neon Postgres, with sign-in** *(added in iteration 3, from Kay's "why not a neon database")*: A Neon Postgres project holds the test data: sessions, summaries, the care-team inbox and nurse replies, the demo patients, and the knowledge-base chunks. The browser talks to it directly through Neon's Data API (an HTTP interface to the database). Testers sign in through Neon Auth, and Postgres row-level security decides what each person can read: testers see their own sessions, the sponsor sees everyone's care-team inbox, and the knowledge base is readable only by signed-in users. There's **no server of our own**, and the OpenRouter key stays per-tester in the browser, as in D. The guided walkthrough for the sponsor stays. Data is synthetic and test-only, and the "don't enter real health information" notice stays on screen.

**Recommendation**: (by Nibble, Claude Opus 5.5, 2026-11-14)

**E — Neon Postgres, with sign-in.** *Revised again in iteration 3, stated explicitly*: My move to D minimized infrastructure, and Kay's question exposes what that cost. D's care-team inbox lives in *each tester's own browser*, so the sponsor can never open one inbox holding the summaries from teammates' test sessions. Yet the nurse-facing handoff is the feature the sponsor most needs to judge (ADR-0008). E makes that inbox real and shared. It also removes D's file shuffling: there's no knowledge-base file to import and no session files to return. The knowledge base stays private because it's behind sign-in, not on the public site. The cost is that the security setup has to be right: the site is public, so a Data API with missing or wrong row-level security would expose everything. That makes RLS policies a tested part of the build (sign-in as each role, and check what's visible), not an afterthought. E also amends two earlier decisions. ADR-0008's QST-HANDOFF-STORAGE moves from A (one device) to B (hosted database). And Harness's no-backend premise (ADR-0001) gains a managed database, though there's still no server of our own and the key handling doesn't change. A Neon connection is already available in this environment, so provisioning is quick once Kay approves it. *Confidence*: 0.65 — because E is a few days' more build than D, and that's only worth it if the shared inbox is in the sponsor review, which is my reading of ADR-0008. *If wrong*: if the timeline is tight, or the sponsor review can happen in the one guided walkthrough on Kay's device, **D** is enough. If testers will need nothing but the walkthrough, use **A**.

*Iteration-2 rationale for D, kept as written*: Kay narrowed the testers to the clinical sponsor and teammates, with no older test users. That removes A's main reason: watching low-tech users hesitate. It also makes remote access practical, because every tester already has access to the team Drive, where the knowledge base lives. D keeps every earlier decision intact: no backend, the key stays in the browser, one device per tester, and the corpus stays private. Sessions still come back to the team, through Drive. The guided first session matters because the sponsor's real job is clinical review, not using the app: signing off the Clinical assumptions log (ADR-0006), judging whether the care-team summaries are useful (ADR-0008), and checking that the demo regimens and traces are plausible (ADR-0009). A walkthrough gets that done in one sitting. *Confidence*: 0.75 — because it assumes the sponsor can get through a one-time setup (paste a key, pick a file). If that's too much, the walkthrough alone still works. *If wrong*: if the sponsor won't do any setup, keep only the walkthrough, with Kay driving and sharing the screen, which is **A** for the sponsor. If more testers join from outside the team, revisit **B** or **C**.

*Original rationale for A, which applied when testers included older adults*: For the people this bot is designed for, moderated testing is the better method anyway. Asking an older, low-tech user to paste an API key or email back a file tests the setup, not the bot. And watching where they hesitate is the finding you're after. A needs no infrastructure, keeps the ADA material off the public site, and fits the one-device design already decided. B depends on a redistribution permission nobody has confirmed. C is a project of its own, and once real testers are typing, it holds data that drifts toward PHI. *Confidence*: 0.7 — because if the course requires unmoderated remote testing at scale, A can't deliver it. *If wrong*: if testers must be remote and unmoderated, flip to **B** once ADA redistribution is confirmed, or to **C** if it isn't.

**ANS:** (by Kay)
e

---

## Decision

**Chosen: E — Neon Postgres, with sign-in** (Kay, 2026-11-14).

- **Where the data lives**: a Neon Postgres project holds sessions, summaries, the care-team inbox and nurse replies, the demo patients, and the knowledge-base chunks. The browser keeps only a local cache.
- **Access**: the browser goes through Neon's Data API, with sign-in through Neon Auth. Postgres row-level security (RLS) sets three roles:
  - *tester*: reads and writes their own sessions, and reads demo patients and the knowledge base.
  - *sponsor / care team*: reads every session's summary and transcript, and writes replies.
  - *anonymous*: nothing.
- **RLS is tested, not assumed.** The build includes checks that sign in as each role and confirm what it can and can't read. Anonymous must see nothing, because the site is public. These checks run against a Neon branch, so they never touch the testers' data.
- **Unchanged**: each tester keeps their own capped OpenRouter key in the browser (ADR-0001). There's still no server of our own. The data is synthetic and test-only, with the "don't enter real health information" notice. The sponsor still starts with a guided walkthrough.
- **Amends**: ADR-0008's QST-HANDOFF-STORAGE (A to a hosted database), and the knowledge-base hosting in ADR-0005 (from the team Drive on the demo device to Neon behind sign-in, loaded once from the Drive by a team script).
- **Provisioning**: a Neon connection is available in this environment. Creating the project, Data API, and Auth is done only on Kay's explicit go-ahead. *(Iteration 5: Kay is setting it up personally.)*

### Auth: Neon's Managed Better Auth (iteration 5)

Kay asked whether to use Better Auth. **Yes, but Neon's *managed* version (Neon Auth), not self-hosted Better Auth.** Self-hosted Better Auth is a server library: it needs auth endpoints running somewhere, which would mean a server of our own. Neon's Managed Better Auth runs those endpoints for us. It issues JWTs carrying `role: authenticated`, which the Data API turns into that Postgres role, and `auth.user_id()` reads the user ID out of the token for RLS policies (Neon docs: *Data API, Access control & security*, updated 2026-09-14). The frontend uses Neon's `neon-js` client.

**Since anyone can reach the public site, three setup rules apply:**

1. **Signing up must not grant access.** Anyone who finds the site can create an account, and every signed-in account gets the `authenticated` role. So access to the data comes from a `members` table (user ID → `tester` or `sponsor`), filled in by Kay, not from being signed in. Every RLS policy checks membership. A stranger with an account sees nothing. If Managed Better Auth can turn off public sign-up, do that too, but don't rely on it alone.
2. **No anonymous access.** Leave `allowAnonymous` off, and grant nothing to the `anonymous` role (the default).
3. **RLS on every table, from the start.** When the Data API is enabled from the console, it grants `authenticated` full read and write on every `public` table. With RLS off, every signed-in user reads every row. Turn on RLS for each table as it's created, and treat the console's Data API Advisor warnings as build failures.

**Secrets**: the Data API URL and auth URL go in the frontend's build settings and are public by design. The database connection string (it contains the password) never goes in the frontend or the repo.

### Provisioned and checked (iteration 6, 2026-11-14)

Kay created project `diabetes-chatbot` (`old-darkness-71254945`, AWS US East 2, branch `production`) with Postgres, Managed Better Auth, the Data API, and the AI Gateway. The repo is linked with `neon init`. `neon.ts` declares the services, and `neon config plan` reported no changes. Neon's generic step "wire each service into the app" was **not** run, because it could put `DATABASE_URL` into the public bundle. Wiring follows this ADR's Data API plus sign-in design instead.

Checks run against the live project:

| Check | Result |
|---|---|
| Data API, no token | **401**: nothing readable without sign-in |
| Data API exposed schemas | `public` only, so the auth tables in `neon_auth` aren't exposed. Anonymous role: `anonymous`. No `public` tables exist yet |
| Auth, JWKS endpoint | **200** |
| Auth, browser preflight (CORS) from `https://kayc26.github.io` | **204**, origin allowed |
| AI Gateway, `GET /v1/models` with no token | **401**: the host is correct |
| AI Gateway, browser preflight from `https://kayc26.github.io` | **405, no CORS headers** |
| Built bundle (`dist/`) scanned for `nt_live_`, `postgres://`, `npg_` | **0 matches** |
| `.env.local` (holds `DATABASE_URL` and the gateway token) | Git-ignored (`*.local`) |

**Settled: the AI Gateway can't be called from the browser.** Its preflight fails, so pasting per-tester gateway credentials (the iteration-5 middle path) won't work in this app. Testers keep **OpenRouter** keys (ADR-0001). The gateway stays an option only behind a Neon Function (Open Follow-ups). It also has no credits yet, so its model catalog wasn't checked.

**Auth settings that conflict with this ADR's rules** (as of the check):

- `allow_sign_up: true`: anyone who finds the site can register. Membership-based RLS still protects the data, but sign-up should be off, with Kay creating accounts for the sponsor and teammates.
- **Google sign-in is enabled** (Neon's shared OAuth app). It's another way for strangers to create accounts, so turn it off unless the team wants it.
- `trusted_origins: []`: add `https://kayc26.github.io` so sign-in from the deployed site is accepted. Keep `allow_localhost` on while developing.

**Resolved later on 2026-11-14 (iteration 7)**: Kay turned off sign-up and removed Google in the console. The domain didn't save there, so Nibble added it through the Neon connection. A re-read showed `allow_sign_up: false`, `oauth_providers: []`, and `trusted_origins: ["https://kayc26.github.io"]`. **Live proof:** a sign-up attempt from the site's origin returned `400 EMAIL_PASSWORD_SIGN_UP_DISABLED`, so no account was created. Still to do before going live: turn off `allow_localhost` (Neon's production checklist). Accounts for the sponsor and teammates are created by Kay, or by Nibble on request, and added to `members`.

---

### Sign-in in the app (iteration 8)

These came from probing the live project on 2026-11-14 and are now built and deployed (commit `446a430`):

- **Plain `fetch`, not Neon's SDKs.** The browser packages are all 0.x, three of them betas. Neon's ready-made reset screens are React, and its SDK doesn't support password reset yet.
- **Cookie session only.** The session is an HttpOnly cookie marked `Partitioned` (CHIPS). That keeps it working cross-site from `github.io` with `credentials: 'include'` in browsers that block ordinary third-party cookies. A Bearer session token is **rejected** by this setup. That's a good thing: the app keeps no session token in `localStorage`, so there's nothing for injected script to steal.
- **Short-lived JWT for the Data API**, fetched from `/token` and refreshed when less than a minute is left.
- **Setting a password by emailed code** (`/forget-password/email-otp`, then `/email-otp/reset-password`). The same flow serves a forgotten password and an admin-created account's first password. A code is easier for older users than a 15-minute link. Mail comes from Neon's shared sender (`auth@mail.myneon.app`), so check spam.
- **Being signed in isn't access.** After sign-in the app reads the user's own `members` row. Without one, the user sees "your account hasn't been added to this demo yet".
- **The site at `/` is now the diabetes assistant.** Harness v1 is still reachable at `#/harness`.
- **Tests**: 14 offline tests (plain-language messages, password checks, token refresh, views per role), plus 5 live tests that run the app's own client against `rls-dev` through a browser-like cookie jar.

**Not yet verified in a real browser.** CHIPS behavior on Safari and Chrome can only be checked by signing in on the deployed site. Kay's first sign-in is that check.

---

## Trade-offs

- **A doesn't scale.** Each session takes a facilitator's time, and a class project rarely has more than a handful of sessions anyway.
- **Any remote option spends money unattended.** Each tester's model calls cost credit. A per-key cap (B) or a server-side budget (C) is required, as is the 8-round loop cap from ADR-0003.

---

## Open Follow-ups

- [ ] **A test protocol for moderated sessions**: tasks to try (ask a nutrition question, report a high reading, ask for a dose), what to observe, and consent wording. This should be checked against course or IRB guidance before recruiting.
- [ ] **A notice on the public site** that the link alone is a non-working preview ("This demo needs setup; contact the team"), so a stranger who finds it isn't left with a broken bot.
- [ ] **Later option: Neon AI Gateway instead of per-tester OpenRouter keys** (seen while creating the project on 2026-11-14; left off for now). The gateway takes OpenAI-style calls and covers many models, with prepaid credits and a default daily spend cap (Neon docs: *AI Gateway quickstart* and *prepaid credits*). But it authenticates with a **project credential**, a secret that can't go in the public browser bundle. Using it would mean a Neon Function that checks the tester's sign-in token and forwards the call, which would be our first server-side code. That would remove the key-setup step for the sponsor. Revisit if the per-tester keys turn out to be a burden.
  - *Refined on 2026-11-14, after Kay asked whether testers could share a secret:* there is a middle path. Neon can mint **named credentials per tester** (Settings → Credentials). Each is scoped to `ai_gateway:invoke` only, so it can't touch the database, takes an expiry date (`expires_at`, up to 365 days), and can be revoked individually (Neon docs: *AI Gateway authentication*, updated 2026-10-09). A tester pastes theirs once, exactly as with an OpenRouter key. That gives one Neon bill, keys that expire on their own, and no OpenRouter accounts. **Unverified before relying on it:** (1) whether the gateway accepts calls straight from a browser (CORS); (2) per-credential spend limits (the docs describe only a shared credit pool with an account-level daily cap); (3) whether the catalog has two model families for the answering model and the monitor (ADR-0007; an Anthropic endpoint exists); (4) the gateway's data-retention terms. Never hand out the Connect dialog's default credential: rotating it would break every tester at once.

---

## Iterations

### Iteration 1 (2026-11-14)
- Trigger: Kay asked how sharing the GitHub Pages link works for a test user
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Mapped what a remote tester gets, and posed QST-TEST-ACCESS.
- Outcome: Draft

### Iteration 2 (2026-11-14)
- Trigger: Kay: testing is only with the clinical sponsor and teammates.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Option D added (link, private setup kit through the team Drive, guided first session for the sponsor). The recommendation moves from A to D, with the reason stated. With no older adults being recruited, the IRB concern mostly falls away, because this is an internal design review. Still confirm with course staff.
- Outcome: Draft

### Iteration 3 (2026-11-14)
- Trigger: Kay: "why not a neon database"
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Option E added: Neon Postgres through the Data API, with Neon Auth and row-level security, and no server of our own. The recommendation moves from D to E, with the reason stated: a shared care-team inbox is what the sponsor review needs, and it also removes the file shuffling. If chosen, this reopens ADR-0008's QST-HANDOFF-STORAGE (A to B).
- Outcome: Draft

### Iteration 4 (2026-11-14)
- Trigger: Kay answered QST-TEST-ACCESS: E
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Decision added: Neon with the Data API, Neon Auth, and three RLS roles, with RLS checks as part of the build. ADR-0008's storage and ADR-0005's knowledge-base hosting are amended to match.
- Outcome: Draft → Accepted

### Iteration 5 (2026-11-14)
- Trigger: Kay is setting up Neon and asked "should I use better auth"
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Auth decided: Neon's Managed Better Auth, not self-hosted. Three setup rules: membership-based RLS (signing up doesn't grant access), no anonymous access, and RLS on every table from the start. Secrets handling noted.
- Outcome: Accepted

### Iteration 6 (2026-11-14)
- Trigger: Kay provisioned the Neon project. Nibble linked the repo and ran the checks.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Recorded the project, link, and check results. The AI Gateway was ruled out for direct browser use (no CORS), so testers stay on OpenRouter keys. Three auth settings flagged for change: sign-up, Google sign-in, and trusted origins.
- Outcome: Accepted

### Iteration 7 (2026-11-14)
- Trigger: Kay updated the auth settings in the console.
- Contributors: Kay, Nibble (Claude Opus 5.5)
- Changes: Sign-up turned off and Google removed (Kay). Trusted domain added through the Neon connection (Nibble), after the console change didn't save. Verified with a re-read, plus a live sign-up attempt that was rejected with `EMAIL_PASSWORD_SIGN_UP_DISABLED`.
- Outcome: Accepted

---

## Links

- Related ADRs: ADR-0001 (key in the browser), ADR-0003 (round cap), ADR-0005 (knowledge base off the public site; real-PHI notice), ADR-0006 (demo mode), ADR-0008 (one-device storage), ADR-0009 (dataset licenses)
