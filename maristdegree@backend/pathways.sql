-- Run after db.sql and before majors.sql. Safe to run again.
-- Core Pathways: 12-credit interdisciplinary topics every student declares.
-- `tags` are matched against a student's goals and milestones to suggest a pathway.

create table if not exists public.pathways (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  description text,
  tags        text[] not null default '{}'
);

alter table public.pathways enable row level security;
drop policy if exists "read pathways" on public.pathways;
create policy "read pathways" on public.pathways for select to authenticated using (true);
grant select on public.pathways to authenticated;
grant all on public.pathways to service_role;

-- Demo pathways. Replace these with Marist's official Pathway list.
insert into public.pathways (slug, name, description, tags) values
  ('technology-and-society', 'Technology and Society',
   'How technology shapes ethics, work and everyday life.',
   array['technology', 'ethics', 'software', 'ai', 'data']),
  ('global-studies', 'Global Studies',
   'Cultures, economies and politics in a connected world.',
   array['international', 'travel', 'languages', 'politics', 'business']),
  ('sustainability', 'Sustainability',
   'Environmental, economic and social sustainability.',
   array['environment', 'climate', 'policy', 'science', 'energy']),
  ('leadership-and-ethics', 'Leadership and Ethics',
   'Making responsible decisions in organizations and communities.',
   array['management', 'leadership', 'ethics', 'business', 'law']),
  ('health-and-wellness', 'Health and Wellness',
   'The science, policy and culture of human health.',
   array['health', 'medicine', 'psychology', 'fitness', 'public health']),
  ('creativity-and-media', 'Creativity and Media',
   'Storytelling, design and the arts across media.',
   array['art', 'design', 'film', 'writing', 'games'])
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      tags = excluded.tags;
