-- Run this once in the Supabase SQL editor (or via `supabase db push`).

create type public.user_role as enum ('advisor', 'student');

-- One profile row per auth user; the role lives here.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  full_name  text,
  role       public.user_role not null default 'student',
  created_at timestamptz not null default now()
);

-- Every new auth user gets a profile. The role always starts as 'student':
-- it is never read from signup metadata, so nobody can sign up as an advisor.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper for policies. Security definer so it can read profiles without
-- triggering the policies on profiles again (which would recurse).
create function public.is_advisor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'advisor'
  );
$$;

alter table public.profiles enable row level security;

-- Students see their own profile; advisors see everyone.
create policy "read own profile, advisors read all"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or public.is_advisor());

create policy "update own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Signed-in users can read profiles and change only their own name.
-- Roles can only be changed with the service-role key (see seed.js).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;