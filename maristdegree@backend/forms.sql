-- Run after dashboard.sql (and re-run pathways.sql first). Safe to run again.
-- Registrar forms filled in by the app, starting with the Pathway Declaration.

-- Fields the registrar's forms need.
alter table public.profiles
  add column if not exists cwid       text unique,
  add column if not exists advisor_id uuid references public.profiles (id) on delete set null;
-- Students still can't change these: db.sql only grants update on full_name,
-- and majors.sql on pathway_id. seed.js sets them with the secret key.

-- Remove the old demo pathways (they have no form_value in the official list).
-- Only once the official list from pathways.sql is loaded; otherwise every
-- pathway would look like a demo one and get deleted.
alter table public.pathways add column if not exists form_value text;

update public.profiles set pathway_id = null
  where pathway_id in (select id from public.pathways where form_value is null)
    and exists (select 1 from public.pathways where form_value is not null);
delete from public.pathways
  where form_value is null
    and exists (select 1 from public.pathways where form_value is not null);

-- One row per form. `data` holds exactly what is written into the PDF, so
-- the PDF can be regenerated at any time.
create table if not exists public.form_submissions (
  id                bigint generated always as identity primary key,
  form_type         text not null check (form_type in ('pathway_declaration')),
  student_id        uuid not null references public.profiles (id) on delete cascade,
  advisor_id        uuid references public.profiles (id) on delete set null,
  data              jsonb not null,
  status            text not null default 'pending_advisor'
                    check (status in ('pending_advisor', 'sent_to_registrar', 'withdrawn')),
  advisor_signed_at timestamptz,
  sent_at           timestamptz,
  email_error       text,
  created_at        timestamptz not null default now()
);

-- A form can only be marked as sent once the advisor has signed it.
alter table public.form_submissions
  drop constraint if exists sent_requires_advisor_signature;
alter table public.form_submissions
  add constraint sent_requires_advisor_signature check (
    status <> 'sent_to_registrar'
    or (
      advisor_signed_at is not null
      and advisor_id is not null
      and coalesce(data ->> 'advisor_signature', '') <> ''
    )
  );

alter table public.form_submissions enable row level security;

-- Students see their own forms; advisors see all of them.
drop policy if exists "read own forms, advisors read all" on public.form_submissions;
create policy "read own forms, advisors read all"
  on public.form_submissions for select to authenticated
  using (student_id = (select auth.uid()) or public.is_advisor());

-- Read-only for signed-in users. The backend creates, signs and sends forms
-- with the secret key after checking who is asking, so nobody can insert a
-- form with made-up data through the public API.
revoke all on public.form_submissions from anon, authenticated;
grant select on public.form_submissions to authenticated;
grant all on public.form_submissions to service_role;
