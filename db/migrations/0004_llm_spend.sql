-- 0004_llm_spend.sql
-- ADR-0014 (QST-KEY-SHARING: C): the shared OpenRouter key lives in the Neon Function
-- "llm", which spends it for signed-in members up to $1 per tester. Each model call's
-- cost (from OpenRouter's usage.cost) is recorded here against the caller, and the
-- function sums it to enforce the cap and to report the percentage the chat shows.
--
-- Written only by the function, which connects as the branch owner. Nobody reads or
-- writes it through the Data API: the chat asks the function (GET /allowance) instead,
-- so no grants and no policies are needed; RLS is on so that stays true by default.

begin;

create table public.llm_spend (
  id         bigint generated always as identity primary key,
  user_id    text not null,                                   -- neon_auth user id (JWT sub)
  model      text not null,
  cost       numeric(12, 6) not null check (cost >= 0),       -- dollars, as OpenRouter reports
  tokens     int not null default 0,
  created_at timestamptz not null default now()
);
create index llm_spend_user on public.llm_spend (user_id);

revoke all on public.llm_spend from public, anonymous, authenticated;
alter table public.llm_spend enable row level security;

commit;
