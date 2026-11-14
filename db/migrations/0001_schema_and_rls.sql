-- 0001_schema_and_rls.sql
-- Diabetes education bot: tables and row-level security for the Neon Data API.
--
-- Decisions this file implements:
--   ADR-0010  Neon Postgres via Data API + Managed Better Auth; access is decided by
--             membership (public.members), never by merely being signed in, because
--             the site is public and anyone could hold an account.
--   ADR-0008  Consent C: the care team (sponsor) sees a session only once its summary
--             is shared ('auto' for flowchart-flagged, 'patient_sent' otherwise);
--             'kept' summaries and their transcripts stay the patient's own.
--   ADR-0009  Demo patients and glucose readings (minutes before load, re-anchored at load).
--   ADR-0005  Knowledge-base chunks: readable only by signed-in members, never public.
--
-- Roles at request time (set by the Data API from the JWT):
--   anonymous      no token or no role claim           -> no grants at all
--   authenticated  any signed-in account               -> grants below, filtered by RLS
-- App-level roles come from public.members.role: 'tester' | 'sponsor'.
--
-- Least privilege: this project has no default grants to `authenticated`, so every
-- table is closed until granted here, and each grant is the narrowest that works.

begin;

-- ---------------------------------------------------------------------------
-- Helper schema (NOT exposed by the Data API, which serves `public` only)
-- ---------------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------------
create table public.members (
  user_id      text primary key,                       -- neon_auth.user.id (JWT sub)
  role         text not null check (role in ('tester', 'sponsor')),
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- SECURITY DEFINER so policies can consult membership without recursing through
-- members' own RLS. search_path pinned so the definer cannot be hijacked.
create function app.member_role() returns text
  language sql stable security definer
  set search_path = pg_catalog, public
as $$ select role from public.members where user_id = auth.user_id() $$;

create function app.is_member() returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
as $$ select app.member_role() is not null $$;

create function app.is_sponsor() returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
as $$ select coalesce(app.member_role() = 'sponsor', false) $$;

-- ---------------------------------------------------------------------------
-- Reference data: demo patients, glucose readings, knowledge base
-- ---------------------------------------------------------------------------
create table public.patients (
  id             text primary key,
  display_name   text not null,                        -- fictional (ADR-0009)
  age            int  not null check (age between 0 and 120),
  diabetes_type  text not null check (diabetes_type in ('type1', 'type2')),
  uses_cgm       boolean not null,
  regimen        jsonb not null,                       -- read-back only; never sent to the model (ADR-0005)
  flags          jsonb not null default '{}',          -- history_of_dka, pregnant, uses_pump (ADR-0006)
  clinic_history jsonb not null default '{}',          -- calls_60d, days_since_visit, ... (ADR-0008)
  data_source    jsonb not null default '{}',          -- dataset citation + subject id (ADR-0009)
  created_at     timestamptz not null default now()
);

create table public.glucose_readings (
  id                  bigint generated always as identity primary key,
  patient_id          text not null references public.patients (id) on delete cascade,
  minutes_before_load int  not null check (minutes_before_load >= 0),
  value_mgdl          numeric(5, 1) not null check (value_mgdl > 0),
  source              text not null check (source in ('cgm', 'fingerstick'))
);
create index glucose_readings_patient_time on public.glucose_readings (patient_id, minutes_before_load);

create table public.kb_chunks (
  id            text primary key,
  doc_title     text not null,
  source_label  text not null check (source_label in ('ADA', 'care_team')),
  section       text,
  body          text not null,
  tags          text[] not null default '{}',          -- 'urgent', 'medication', 'dose_related', ...
  snapshot_date date not null
);

-- ---------------------------------------------------------------------------
-- Conversation data
-- ---------------------------------------------------------------------------
create table public.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null default auth.user_id(),
  patient_id text not null references public.patients (id),
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);
create index sessions_user on public.sessions (user_id);

create table public.messages (
  id         bigint generated always as identity primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  turn       int  not null check (turn >= 0),
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now(),
  unique (session_id, turn, role)
);

create table public.triage_events (                    -- code-kept event log (ADR-0008)
  id         bigint generated always as identity primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  turn       int  not null check (turn >= 0),
  tier       text not null check (tier in ('none', 'checkin', 'urgent', 'emergency', 'distress')),
  source     text not null check (source in ('rules', 'classifier', 'monitor', 'profile')),
  criteria   text[] not null default '{}',
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index triage_events_session on public.triage_events (session_id);

create table public.summaries (
  session_id   uuid primary key references public.sessions (id) on delete cascade,
  fields       jsonb not null,                         -- each value cites its turn (ADR-0008)
  criteria_met jsonb not null default '[]',
  shared       text not null default 'kept' check (shared in ('kept', 'auto', 'patient_sent')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.replies (                          -- nurse replies (ADR-0008, reply path C)
  id         bigint generated always as identity primary key,
  session_id uuid not null references public.summaries (session_id) on delete cascade,
  author_id  text not null default auth.user_id(),
  body       text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index replies_session on public.replies (session_id);

-- Session-level helpers (definer: they read sessions/summaries regardless of the
-- caller's RLS, and return only a boolean about the caller's own relationship).
create function app.owns_session(sid uuid) returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
as $$
  select app.is_member()
     and exists (select 1 from public.sessions s where s.id = sid and s.user_id = auth.user_id())
$$;

create function app.session_shared(sid uuid) returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
as $$ select exists (select 1 from public.summaries m where m.session_id = sid and m.shared <> 'kept') $$;

create function app.sponsor_can_see(sid uuid) returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
as $$ select app.is_sponsor() and app.session_shared(sid) $$;

-- Once a summary reaches the care team it stays there: un-sharing would silently
-- pull a record a nurse may already be acting on.
create function app.summaries_guard() returns trigger
  language plpgsql
  set search_path = pg_catalog, public
as $$
begin
  if old.shared <> 'kept' and new.shared = 'kept' then
    raise exception 'a summary shared with the care team cannot be made private again'
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end
$$;
create trigger summaries_guard before update on public.summaries
  for each row execute function app.summaries_guard();

revoke all on all functions in schema app from public;
grant execute on function app.member_role(), app.is_member(), app.is_sponsor(),
  app.owns_session(uuid), app.session_shared(uuid), app.sponsor_can_see(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Grants (narrowest that works). Nothing at all for anonymous.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public, anonymous;

grant select                          on public.members          to authenticated;
grant select                          on public.patients         to authenticated;
grant select                          on public.glucose_readings to authenticated;
grant select                          on public.kb_chunks        to authenticated;
grant select, insert                  on public.sessions         to authenticated;
grant update (ended_at)               on public.sessions         to authenticated;
grant select, insert                  on public.messages         to authenticated;
grant select, insert                  on public.triage_events    to authenticated;
grant select, insert                  on public.summaries        to authenticated;
grant update (fields, criteria_met, shared) on public.summaries  to authenticated;
grant select, insert                  on public.replies          to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security: on for every table, before any data exists.
-- ---------------------------------------------------------------------------
alter table public.members          enable row level security;
alter table public.patients         enable row level security;
alter table public.glucose_readings enable row level security;
alter table public.kb_chunks        enable row level security;
alter table public.sessions         enable row level security;
alter table public.messages         enable row level security;
alter table public.triage_events    enable row level security;
alter table public.summaries        enable row level security;
alter table public.replies          enable row level security;

-- members: see yourself; the sponsor sees everyone (names in the inbox).
create policy members_read on public.members for select to authenticated
  using (user_id = auth.user_id() or app.is_sponsor());

-- reference data: members only.
create policy patients_read on public.patients for select to authenticated
  using (app.is_member());
create policy glucose_read on public.glucose_readings for select to authenticated
  using (app.is_member());
create policy kb_read on public.kb_chunks for select to authenticated
  using (app.is_member());

-- sessions: your own; the sponsor also sees sessions whose summary was shared.
create policy sessions_read on public.sessions for select to authenticated
  using ((app.is_member() and user_id = auth.user_id()) or app.sponsor_can_see(id));
create policy sessions_create on public.sessions for insert to authenticated
  with check (app.is_member() and user_id = auth.user_id());
create policy sessions_end on public.sessions for update to authenticated
  using (app.is_member() and user_id = auth.user_id())
  with check (user_id = auth.user_id());

-- messages and triage events: follow the session.
create policy messages_read on public.messages for select to authenticated
  using (app.owns_session(session_id) or app.sponsor_can_see(session_id));
create policy messages_create on public.messages for insert to authenticated
  with check (app.owns_session(session_id));

create policy triage_read on public.triage_events for select to authenticated
  using (app.owns_session(session_id) or app.sponsor_can_see(session_id));
create policy triage_create on public.triage_events for insert to authenticated
  with check (app.owns_session(session_id));

-- summaries: the owner reads/writes; the sponsor reads only shared ones.
create policy summaries_read on public.summaries for select to authenticated
  using (app.owns_session(session_id) or (app.is_sponsor() and shared <> 'kept'));
create policy summaries_create on public.summaries for insert to authenticated
  with check (app.owns_session(session_id));
create policy summaries_update on public.summaries for update to authenticated
  using (app.owns_session(session_id))
  with check (app.owns_session(session_id));

-- replies: the sponsor writes on shared summaries; the session owner and sponsor read.
create policy replies_read on public.replies for select to authenticated
  using (app.owns_session(session_id) or app.sponsor_can_see(session_id));
create policy replies_create on public.replies for insert to authenticated
  with check (app.sponsor_can_see(session_id) and author_id = auth.user_id());

commit;
