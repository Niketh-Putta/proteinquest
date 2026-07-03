-- Block duplicate league/display names (case-insensitive) for new picks.

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
