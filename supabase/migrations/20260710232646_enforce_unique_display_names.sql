-- Deduplicate existing case-insensitive display names, then lock uniqueness.
-- Keep the highest-XP profile for each name; rename the rest with a numeric suffix.

with ranked as (
  select
    id,
    display_name,
    lower(trim(display_name)) as key,
    row_number() over (
      partition by lower(trim(display_name))
      order by coalesce(xp, 0) desc, created_at asc nulls last, id asc
    ) as rn
  from public.profiles
  where nullif(trim(display_name), '') is not null
),
dupes as (
  select * from ranked where rn > 1
)
update public.profiles p
set display_name = left(trim(p.display_name), 28) || d.rn::text
from dupes d
where p.id = d.id;

do $$
declare
  r record;
  candidate text;
  n int;
begin
  for r in
    select id, display_name
    from public.profiles
    where nullif(trim(display_name), '') is not null
      and exists (
        select 1 from public.profiles o
        where o.id <> public.profiles.id
          and lower(trim(o.display_name)) = lower(trim(public.profiles.display_name))
      )
  loop
    n := 2;
    loop
      candidate := left(trim(r.display_name), 24) || n::text;
      exit when not exists (
        select 1 from public.profiles o
        where o.id <> r.id
          and lower(trim(o.display_name)) = lower(candidate)
      );
      n := n + 1;
    end loop;
    update public.profiles set display_name = candidate where id = r.id;
  end loop;
end $$;

create or replace function public.enforce_unique_display_name()
returns trigger
language plpgsql
as $$
declare
  normalized text;
begin
  normalized := nullif(trim(new.display_name), '');
  if normalized is null then
    new.display_name := null;
    return new;
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id <> new.id
      and lower(trim(p.display_name)) = lower(normalized)
  ) then
    raise exception 'display_name_taken'
      using errcode = '23505';
  end if;

  new.display_name := normalized;
  return new;
end;
$$;

drop trigger if exists profiles_display_name_unique on public.profiles;
create trigger profiles_display_name_unique
  before insert or update of display_name on public.profiles
  for each row
  execute function public.enforce_unique_display_name();

create unique index if not exists profiles_display_name_unique_ci
  on public.profiles (lower(trim(display_name)))
  where nullif(trim(display_name), '') is not null;

create or replace function public.is_display_name_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles p
    where lower(trim(p.display_name)) = lower(trim(p_name))
      and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  );
$$;

grant execute on function public.is_display_name_available(text) to authenticated;
