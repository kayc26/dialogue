// The database's own guarantee about topic-card approval (migration 0003, ADR-0013):
// a patient sees an approved card word for word, so an approval must always name the
// exact text and sources that exist. Each case is something a loader or a person
// could really do: load a card already marked approved, edit approved text, approve
// and edit in one statement, or reload the knowledge base under an approved card.
//
// Runs against the throwaway rls-dev branch with its OWNER connection string (the only
// role that can write cards), never production, outside the offline gate:
//   RLS_OWNER_DATABASE_URL=... npm run test:db
// Uses its own ids (card-test-*, chunk test-chunk-*) and removes them afterwards.

import { neon } from '@neondatabase/serverless'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL = process.env.RLS_OWNER_DATABASE_URL ?? ''
const sql = URL ? neon(URL) : null

const status = async (id: string) =>
  (await sql!`select status, approved_by from public.kb_cards where id = ${id}`)[0] as { status: string; approved_by: string | null }
const approve = (id: string) => sql!`update public.kb_cards set status = 'approved', approved_by = 'Test Sponsor', approved_at = now() where id = ${id}`

describe.skipIf(!sql)('topic-card approval, enforced by the database', () => {
  beforeAll(async () => {
    // production's endpoint (src/config.ts): this suite writes, so it must never run there
    if (new globalThis.URL(URL).hostname.includes('ep-raspy-surf-beqr8avd')) throw new Error('refusing to run against production')
    await sql!`insert into public.kb_chunks (id, doc_title, source_label, section, body, tags, snapshot_date, year, diabetes_type)
               values ('test-chunk-1', 'Test', 'ADA', null, 'Original passage text.', '{}', '2026-11-16', 2026, 'any')
               on conflict (id) do update set body = excluded.body`
  })
  afterAll(async () => {
    await sql!`delete from public.kb_cards where id like 'card-test-%'`
    await sql!`delete from public.kb_chunks where id like 'test-chunk-%'`
  })

  it('a card loaded as "approved" arrives as a draft', async () => {
    await sql!`insert into public.kb_cards (id, topic, body, source_ids, status, approved_by, approved_at)
               values ('card-test-a', 'T', 'Body.', '{test-chunk-1}', 'approved', 'Someone', now())`
    expect(await status('card-test-a')).toEqual({ status: 'draft', approved_by: null })
  })

  it('editing an approved card sends it back to draft; re-saving the same text does not', async () => {
    await sql!`insert into public.kb_cards (id, topic, body, source_ids) values ('card-test-b', 'T', 'Body.', '{test-chunk-1}')`
    await sql!`select app.kb_cards_resync()`
    await approve('card-test-b')
    await sql!`update public.kb_cards set body = 'Body.', asks = '{"a new way to ask"}' where id = 'card-test-b'`
    expect((await status('card-test-b')).status).toBe('approved') // search hints changed, patient-visible text didn't
    await sql!`update public.kb_cards set body = 'Edited body.' where id = 'card-test-b'`
    expect(await status('card-test-b')).toEqual({ status: 'draft', approved_by: null })
  })

  it('approving and editing in the same statement leaves a draft', async () => {
    await sql!`insert into public.kb_cards (id, topic, body, source_ids) values ('card-test-c', 'T', 'Body.', '{test-chunk-1}')`
    await sql!`update public.kb_cards set body = 'Sneaky edit.', status = 'approved', approved_by = 'X', approved_at = now() where id = 'card-test-c'`
    expect((await status('card-test-c')).status).toBe('draft')
  })

  it("a knowledge-base reload that changes a card's source passage sends the card back to draft", async () => {
    await sql!`insert into public.kb_cards (id, topic, body, source_ids) values ('card-test-d', 'T', 'Body.', '{test-chunk-1}')`
    await sql!`select app.kb_cards_resync()`
    await approve('card-test-d')
    await sql!`select app.kb_cards_resync()` // nothing changed: approval stays
    expect((await status('card-test-d')).status).toBe('approved')
    await sql!`update public.kb_chunks set body = 'Rewritten passage text.' where id = 'test-chunk-1'`
    await sql!`select app.kb_cards_resync()`
    expect((await status('card-test-d')).status).toBe('draft')
  })
})
