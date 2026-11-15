-- Run after db.sql, pathways.sql and majors.sql. Safe to run again.
-- Student plans (filled in on the profile setup page) and notices from the
-- registrar and advisors (shown on the student dashboard).

-- One plan per student: goals, interests and pace drive the suggestions.
create table if not exists public.student_plans (
  student_id        uuid primary key references public.profiles (id) on delete cascade,
  interests         text   not null default '',
  career            text   not null default '',
  goals             text[] not null default '{}',
  pace              text   not null default 'medium' check (pace in ('easy', 'medium', 'hard')),
  completed_courses text[] not null default '{}',
  updated_at        timestamptz not null default now()
);

alter table public.student_plans enable row level security;

drop policy if exists "read own plan, advisors read all" on public.student_plans;
create policy "read own plan, advisors read all"
  on public.student_plans for select to authenticated
  using (student_id = (select auth.uid()) or public.is_advisor());

drop policy if exists "insert own plan" on public.student_plans;
create policy "insert own plan"
  on public.student_plans for insert to authenticated
  with check (student_id = (select auth.uid()));

drop policy if exists "update own plan" on public.student_plans;
create policy "update own plan"
  on public.student_plans for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

grant select, insert, update on public.student_plans to authenticated;
grant all on public.student_plans to service_role;

-- Notices. student_id null = sent to every student.
create table if not exists public.notices (
  id         bigint generated always as identity primary key,
  source     text not null check (source in ('registrar', 'advisor')),
  title      text not null,
  body       text not null default '',
  student_id uuid references public.profiles (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.notices enable row level security;

drop policy if exists "read own or broadcast notices" on public.notices;
create policy "read own or broadcast notices"
  on public.notices for select to authenticated
  using (student_id is null or student_id = (select auth.uid()) or public.is_advisor());

-- Advisors can post advisor notices as themselves. Registrar notices are
-- only created with the secret key (seed.js).
drop policy if exists "advisors post notices" on public.notices;
create policy "advisors post notices"
  on public.notices for insert to authenticated
  with check (
    public.is_advisor()
    and source = 'advisor'
    and author_id = (select auth.uid())
  );

grant select, insert on public.notices to authenticated;
grant all on public.notices to service_role;
