-- Run after db.sql and before majors.sql. Safe to run again.
-- Core Pathways: the official list from the registrar's Pathway Declaration
-- Request Form (forms/pathway-declaration.pdf).
-- `form_value` is the exact dropdown text in that PDF (spacing included).
-- `tags` are matched against a student's goals and milestones to suggest a pathway.

create table if not exists public.pathways (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  description text,
  tags        text[] not null default '{}'
);
alter table public.pathways add column if not exists form_value text;

alter table public.pathways enable row level security;
drop policy if exists "read pathways" on public.pathways;
create policy "read pathways" on public.pathways for select to authenticated using (true);
grant select on public.pathways to authenticated;
grant all on public.pathways to service_role;

-- Descriptions are short summaries written for this app, not official text.
insert into public.pathways (slug, name, form_value, description, tags) values
  ('africana-studies', 'Africana Studies', 'Africana Studies',
   'History, cultures and experiences of Africa and the African diaspora.',
   array['africa', 'diaspora', 'culture', 'history', 'race', 'justice']),
  ('american-studies', 'American Studies', 'American Studies',
   'American history, culture, politics and literature.',
   array['america', 'history', 'culture', 'politics', 'literature']),
  ('cognitive-studies', 'Cognitive Studies', 'Cognitive Studies',
   'How minds work, from psychology and neuroscience to AI.',
   array['psychology', 'brain', 'mind', 'ai', 'science', 'research']),
  ('contemporary-european-studies', 'Contemporary European Studies', 'Contemporary European Studies',
   'Modern Europe: politics, economies and cultures.',
   array['europe', 'international', 'travel', 'languages', 'politics', 'business']),
  ('environmental-studies', 'Environmental Studies', 'Environmental Studies',
   'The environment from scientific, social and policy angles.',
   array['environment', 'climate', 'sustainability', 'science', 'policy', 'energy']),
  ('french', 'French', 'French ',
   'Proficiency in French language and francophone cultures.',
   array['french', 'languages', 'travel', 'international', 'culture']),
  ('gender-studies', 'Gender Studies', 'Gender Studies',
   'Gender and identity across society, culture and policy.',
   array['gender', 'justice', 'culture', 'psychology', 'policy']),
  ('global-studies', 'Global Studies', 'Global Studies',
   'Cultures, economies and politics in a connected world.',
   array['international', 'global', 'travel', 'politics', 'business', 'languages']),
  ('hudson-river-valley', 'Hudson River Valley', 'Hudson River Valley',
   'The history, environment and culture of the Hudson River Valley.',
   array['history', 'environment', 'local', 'culture', 'art']),
  ('italian', 'Italian', 'Italian',
   'Proficiency in Italian language and Italian culture.',
   array['italian', 'languages', 'travel', 'culture', 'art']),
  ('jewish-studies', 'Jewish Studies', 'Jewish Studies',
   'Jewish history, religion, thought and culture.',
   array['religion', 'history', 'culture', 'ethics']),
  ('latin-american-caribbean-studies', 'Latin American/Caribbean Studies', 'Latin American/Caribbean Studies',
   'Societies, cultures and languages of Latin America and the Caribbean.',
   array['spanish', 'latin', 'caribbean', 'international', 'culture', 'languages']),
  ('law-social-justice-ethics', 'Law, Social Justice & Ethics', 'Law, Social Justice & Ethics',
   'Law, justice and ethical decision-making in society.',
   array['law', 'justice', 'ethics', 'policy', 'politics', 'leadership']),
  ('medieval-renaissance-studies', 'Medieval/Renaissance Studies', 'Medieval/Renaissance Studies',
   'Art, literature, religion and history of the medieval and Renaissance eras.',
   array['history', 'art', 'literature', 'religion']),
  ('public-health', 'Public Health', 'Public Health',
   'Health of populations: science, policy and communities.',
   array['health', 'medicine', 'policy', 'science', 'data', 'psychology']),
  ('quantitative-studies', 'Quantitative Studies', 'Quantitative Studies',
   'Math, statistics and data reasoning across disciplines.',
   array['math', 'data', 'statistics', 'finance', 'economics', 'research', 'technology']),
  ('religion-society', 'Religion & Society', 'Religion & Society',
   'How religion shapes and is shaped by society.',
   array['religion', 'ethics', 'culture', 'society']),
  ('spanish', 'Spanish', 'Spanish',
   'Proficiency in Spanish language and Hispanic cultures.',
   array['spanish', 'languages', 'travel', 'international', 'culture']),
  ('studies-in-political-economy', 'Studies in Political Economy', 'Studies in Political Economy',
   'Where economics, politics and business meet.',
   array['economics', 'politics', 'business', 'finance', 'policy', 'management']),
  ('technology-society', 'Technology & Society', 'Technology  & Society',
   'How technology shapes ethics, work and everyday life.',
   array['technology', 'software', 'ai', 'data', 'ethics', 'games', 'design'])
on conflict (slug) do update
  set name = excluded.name,
      form_value = excluded.form_value,
      description = excluded.description,
      tags = excluded.tags;
