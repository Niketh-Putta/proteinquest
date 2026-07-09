-- Remote app version gate for soft / force update prompts.

create table public.app_version_config (
  id int primary key default 1 check (id = 1),
  latest_version text not null default '1.0.8',
  min_version text not null default '1.0.0',
  ios_store_url text,
  android_store_url text,
  message text,
  updated_at timestamptz not null default now()
);

comment on table public.app_version_config is
  'Singleton remote config: soft update when below latest_version; force when below min_version.';

insert into public.app_version_config (
  id,
  latest_version,
  min_version,
  ios_store_url,
  android_store_url,
  message
) values (
  1,
  '1.0.8',
  '1.0.0',
  'https://apps.apple.com/app/id6781790996',
  'https://play.google.com/store/apps/details?id=com.proteinquest.app',
  'A newer version of ProteinQuest is available. Update to get the latest features and fixes.'
);

alter table public.app_version_config enable row level security;

-- Public read so the app can check versions before / without auth.
create policy "Anyone can read app version config"
  on public.app_version_config
  for select
  to anon, authenticated
  using (true);

-- Writes only via service_role / dashboard (no insert/update/delete policies for clients).
