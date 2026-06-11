-- Profile pictures: a public avatars bucket + avatar_url on profiles, and the
-- friend leaderboard returns the avatar so rivals show real faces.

alter table public.profiles
  add column if not exists avatar_url text;

-- Public read bucket; writes are restricted to the owner's own folder below.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- Return type gains avatar_url, so the function must be dropped and recreated.
drop function if exists public.friend_leaderboard();
create function public.friend_leaderboard()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  invite_code text,
  xp integer,
  dragon_progress jsonb,
  active_dragon_id text,
  daily_dragon_id text,
  daily_dragon_date date
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id as user_id,
    coalesce(p.display_name, case when p.id = auth.uid() then 'You' else 'ProteinQuest player' end) as display_name,
    p.avatar_url,
    case when p.id = auth.uid() then p.invite_code else null end as invite_code,
    p.xp,
    p.dragon_progress,
    p.active_dragon_id,
    p.daily_dragon_id,
    p.daily_dragon_date
  from public.profiles p
  where p.id = auth.uid()
     or exists (
       select 1
         from public.friendships f
        where f.user_id = auth.uid()
          and f.friend_id = p.id
     )
  order by p.xp desc, p.created_at asc;
$$;

grant execute on function public.friend_leaderboard() to authenticated, anon;
