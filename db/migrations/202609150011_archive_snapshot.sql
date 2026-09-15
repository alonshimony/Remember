create function public.archive_snapshot() returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$declare t text;rows jsonb;dataset jsonb:='{}';bytes bigint:=0;begin
if auth.uid() is null then raise exception 'Authentication required';end if;
foreach t in array array['profiles','spaces','captures','revisions','entities','evidence','events','entity_links','aliases','claims','commitments','commitment_history','reminders','occasions','attachments'] loop
execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from (select * from public.%I limit 1001) r',t) into rows;
if jsonb_array_length(rows)>1000 then raise exception 'Interactive archive limit exceeded; no partial export produced';end if;
bytes:=bytes+octet_length(rows::text);if bytes>20971520 then raise exception 'Interactive archive text exceeds 20 MB; no partial export produced';end if;
dataset:=dataset||jsonb_build_object(t,rows);
end loop;return dataset;end $$;
revoke all on function public.archive_snapshot() from public;
grant execute on function public.archive_snapshot() to authenticated;
