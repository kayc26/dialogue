// 2026-11-17 — Companion to 2026-11-17-monitor-false-positives.ts. What do the FIXED
// triage rules (no model) say about the messages the monitor flagged or missed? Tells
// whether the monitor's extra help alerts change what a tester sees, and whether its
// one miss is covered by the rules anyway. No model calls.
// Run: node node_modules/jiti/lib/jiti-cli.mjs scripts/ephemeral/2026-11-17-rules-on-monitor-cases.ts
import { triageRules } from '../../src/lib/chat/triage'

const profile = { history_of_dka: false, pregnant: false, uses_pump: false }
for (const m of [
  'I had three lows since yesterday and needed my wife to help me once.', // monitor missed (expected urgent)
  'What do I do when I have a high blood sugar (>250 mg/dL)?', // monitor raised to checkin
  'what should i do if my blood sugar is loq', // monitor raised to checkin
  "My sugar is 410 and I've been throwing up all morning.", // monitor raised to urgent
]) {
  const r = triageRules(m, profile)
  console.log(r.tier.padEnd(10), JSON.stringify(r.criteria), '|', m)
}

// Outcome (2026-11-17): the monitor's miss is urgent by the rules (repeated_lows); the
// 410 + vomiting control is emergency by the rules; the two general questions the
// monitor raised to checkin are "none" by the rules.
