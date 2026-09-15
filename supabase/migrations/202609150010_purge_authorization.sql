revoke execute on function public.purge_capture(uuid) from authenticated;
create function public.purge_capture_verified(cid uuid,for_owner uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
perform set_config('request.jwt.claim.sub',for_owner::text,true);
update claims set supersedes=null where owner_id=for_owner and supersedes in(select id from claims where capture_id=cid and owner_id=for_owner);
perform purge_capture(cid);end $$;
revoke all on function public.purge_capture_verified(uuid,uuid) from public,anon,authenticated;
grant execute on function public.purge_capture_verified(uuid,uuid) to service_role;
