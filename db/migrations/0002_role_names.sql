-- 0002_role_names.sql
-- Kay (2026-11-14): "can we call patient_tester, careteam_tester, and admin (see both)".
--
--   tester  -> patient_tester   patient view only: own sessions, transcripts, summaries
--   sponsor -> careteam_tester  care-team view only: shared summaries + transcripts, replies
--   (new)      admin            both views
--
-- Behaviour change beyond the rename: a care-team tester can no longer start patient
-- sessions (the old `sponsor` could, as any member). Role separation is what "admin
-- sees both" implies for the other two.
--
-- Unchanged on purpose: nobody, admin included, reads a summary the patient kept
-- ('kept'). Consent C (ADR-0008) stands until Kay answers QST-ADMIN-PRIVATE.

begin;

-- Roles: rename existing rows, then tighten the check.
alter table public.members drop constraint members_role_check;
update public.members
   set role = case role when 'tester' then 'patient_tester'
                        when 'sponsor' then 'careteam_tester'
                        else role end;
alter table public.members add constraint members_role_check
  check (role in ('patient_tester', 'careteam_tester', 'admin'));

-- New role helpers.
create function app.is_patient() returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
as $$ select coalesce(app.member_role() in ('patient_tester', 'admin'), false) $$;

create function app.is_careteam() returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
as $$ select coalesce(app.member_role() in ('careteam_tester', 'admin'), false) $$;

create function app.careteam_can_see(sid uuid) returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
as $$ select app.is_careteam() and app.session_shared(sid) $$;

-- Ownership now requires the patient view.
create or replace function app.owns_session(sid uuid) returns boolean
  language sql stable security definer
  set search_path = pg_catalog, public
as $$
  select app.is_patient()
     and exists (select 1 from public.sessions s where s.id = sid and s.user_id = auth.user_id())
$$;

revoke all on function app.is_patient(), app.is_careteam(), app.careteam_can_see(uuid) from public;
grant execute on function app.is_patient(), app.is_careteam(), app.careteam_can_see(uuid) to authenticated;

-- Recreate every policy that named the old sponsor helpers or plain membership
-- for patient-side access.
drop policy members_read on public.members;
create policy members_read on public.members for select to authenticated
  using (user_id = auth.user_id() or app.is_careteam());

drop policy sessions_read on public.sessions;
create policy sessions_read on public.sessions for select to authenticated
  using ((app.is_patient() and user_id = auth.user_id()) or app.careteam_can_see(id));
drop policy sessions_create on public.sessions;
create policy sessions_create on public.sessions for insert to authenticated
  with check (app.is_patient() and user_id = auth.user_id());
drop policy sessions_end on public.sessions;
create policy sessions_end on public.sessions for update to authenticated
  using (app.is_patient() and user_id = auth.user_id())
  with check (user_id = auth.user_id());

drop policy messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (app.owns_session(session_id) or app.careteam_can_see(session_id));

drop policy triage_read on public.triage_events;
create policy triage_read on public.triage_events for select to authenticated
  using (app.owns_session(session_id) or app.careteam_can_see(session_id));

drop policy summaries_read on public.summaries;
create policy summaries_read on public.summaries for select to authenticated
  using (app.owns_session(session_id) or (app.is_careteam() and shared <> 'kept'));

drop policy replies_read on public.replies;
create policy replies_read on public.replies for select to authenticated
  using (app.owns_session(session_id) or app.careteam_can_see(session_id));
drop policy replies_create on public.replies;
create policy replies_create on public.replies for insert to authenticated
  with check (app.careteam_can_see(session_id) and author_id = auth.user_id());

-- Old helpers are no longer referenced.
drop function app.sponsor_can_see(uuid);
drop function app.is_sponsor();

commit;
