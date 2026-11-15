-- Run after db.sql and pathways.sql. Safe to run again.
-- Majors are stored as one JSON document each (loaded by seed.js from majors.json).

create table if not exists public.majors (
  slug         text primary key,        -- 'computer-science', 'finance'
  name         text not null,
  requirements jsonb not null
);

alter table public.majors enable row level security;
drop policy if exists "read majors" on public.majors;
create policy "read majors" on public.majors for select to authenticated using (true);
grant select on public.majors to authenticated;
grant all on public.majors to service_role;

-- Each student has a major (set by the admin) and a pathway (chosen by the student).
alter table public.profiles
  add column if not exists major_slug text   references public.majors (slug),
  add column if not exists pathway_id bigint references public.pathways (id);

-- Students may change their own pathway, but not their major or role.
grant update (pathway_id) on public.profiles to authenticated;