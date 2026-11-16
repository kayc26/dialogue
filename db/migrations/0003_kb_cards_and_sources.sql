-- 0003_kb_cards_and_sources.sql
-- ADR-0013 (QST-KB-SHAPE C, QST-KB-REVIEW A, QST-KB-CARD-USE A; iteration 6:
-- QST-KB-BOOK-ROLE A, QST-KB-HOLDOUT-SCOPE A).
--
-- 1. kb_chunks: the sponsor's source set adds a book. Its passages are labelled 'book'
--    (never the authority on numbers, never shown word for word; enforced in the app),
--    and every passage records its document's year and diabetes type.
--
-- 2. kb_cards: approved topic cards. Patients see a card word for word, so the
--    database itself keeps the sponsor's approval honest:
--      - a card arrives as a draft, whatever the insert says;
--      - changing what a patient would see (the text or its sources), or the text of
--        the passages it was written from (source_hash), sends it back to draft, even
--        in the same statement that tries to approve it; so an approval always names
--        text, and sources, that already existed;
--      - members read approved cards only; nobody can write through the Data API
--        (cards are admin-loaded with the owner connection: kb/cards-load.ts,
--        kb/cards-approve.ts).
--    app.kb_cards_resync() recomputes every card's source_hash from the current
--    kb_chunks; the loaders call it after any load, so a knowledge-base update that
--    changes or removes a card's source passage demotes that card to draft.
--
-- Card and passage text is ADA- and book-derived: it lives here and in git-ignored
-- kb/out/, never in the repo (ADR-0005).

begin;

-- ---------------------------------------------------------------------------
-- 1. kb_chunks: source label, year, diabetes type
-- ---------------------------------------------------------------------------
alter table public.kb_chunks drop constraint kb_chunks_source_label_check;
alter table public.kb_chunks add constraint kb_chunks_source_label_check
  check (source_label in ('ADA', 'care_team', 'book'));
alter table public.kb_chunks add column year int check (year between 1900 and 2100);
alter table public.kb_chunks add column diabetes_type text check (diabetes_type in ('type1', 'type2', 'any'));

-- ---------------------------------------------------------------------------
-- 2. kb_cards
-- ---------------------------------------------------------------------------
create table public.kb_cards (
  id          text primary key check (id ~ '^card-[a-z0-9-]+$'),
  topic       text not null,
  asks        text[] not null default '{}',              -- questions it answers; search only, never shown
  body        text not null check (length(body) between 1 and 2000),
  source_ids  text[] not null check (cardinality(source_ids) > 0),  -- kb_chunks ids (no FK: kb:load replaces chunks wholesale)
  source_hash text,                                       -- md5 of the cited passages' text, by app.kb_cards_resync()
  status      text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by text,
  approved_at timestamptz,
  updated_at  timestamptz not null default now(),
  constraint kb_cards_approval check (
    (status = 'approved' and approved_by is not null and approved_at is not null)
    or (status = 'draft' and approved_by is null and approved_at is null)
  )
);

create function app.kb_cards_guard() returns trigger
  language plpgsql
  set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT'
     or new.body is distinct from old.body
     or new.source_ids is distinct from old.source_ids
     or new.source_hash is distinct from old.source_hash then
    new.status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  new.updated_at := now();
  return new;
end
$$;
create trigger kb_cards_guard before insert or update on public.kb_cards
  for each row execute function app.kb_cards_guard();

-- The text a card was written from, in the card's own source order. A missing passage
-- contributes nothing, so deleting a source changes the hash too.
create function app.kb_cards_resync() returns int
  language sql
  set search_path = pg_catalog, public
as $$
  with h as (
    select c.id,
           md5(coalesce(string_agg(k.id || E'\n' || k.body, E'\n\n' order by array_position(c.source_ids, k.id)), '')) as hash
      from public.kb_cards c
      left join public.kb_chunks k on k.id = any (c.source_ids)
     group by c.id
  ), changed as (
    update public.kb_cards c set source_hash = h.hash
      from h
     where h.id = c.id and c.source_hash is distinct from h.hash
    returning 1
  )
  select count(*)::int from changed
$$;

revoke all on function app.kb_cards_guard(), app.kb_cards_resync() from public;

revoke all on public.kb_cards from public, anonymous;
grant select on public.kb_cards to authenticated;

alter table public.kb_cards enable row level security;

create policy kb_cards_read on public.kb_cards for select to authenticated
  using (app.is_member() and status = 'approved');

commit;
