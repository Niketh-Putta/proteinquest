-- Remove a friend from both sides of the reciprocal friendship rows.

create or replace function public.remove_friend(friend uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  if friend = current_user_id then
    raise exception 'cannot remove yourself';
  end if;

  delete from public.friendships
  where (user_id = current_user_id and friend_id = friend)
     or (user_id = friend and friend_id = current_user_id);

  return jsonb_build_object('status', 'removed', 'friend_id', friend);
end;
$$;

grant execute on function public.remove_friend(uuid) to authenticated, anon;
