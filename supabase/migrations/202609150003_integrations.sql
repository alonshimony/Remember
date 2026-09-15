create function public.issue_integration(token_hash text,token_prefix text,allowed_spaces uuid[],allowed_scopes text[],expiry timestamptz) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare id uuid;begin
if auth.uid() is null or cardinality(allowed_spaces)=0 or expiry<=now() or expiry>now()+interval '366 days' then raise exception 'Invalid token configuration';end if;
if exists(select 1 from unnest(allowed_spaces) s where not exists(select 1 from spaces where spaces.id=s and owner_id=auth.uid())) then raise exception 'Invalid space';end if;
insert into integration_tokens(owner_id,hash,prefix,spaces,scopes,expires_at) values(auth.uid(),token_hash,token_prefix,allowed_spaces,allowed_scopes,expiry) returning integration_tokens.id into id;return id;end $$;
revoke all on function public.issue_integration(text,text,uuid[],text[],timestamptz) from public;
grant execute on function public.issue_integration(text,text,uuid[],text[],timestamptz) to authenticated;
create function public.revoke_integration(token_id uuid) returns void language sql security definer set search_path=public,pg_temp as $$update integration_tokens set revoked_at=now() where id=token_id and owner_id=auth.uid();$$;
revoke all on function public.revoke_integration(uuid) from public;
grant execute on function public.revoke_integration(uuid) to authenticated;

create function public.integration_read(token_hash text,endpoint text,object_id uuid default null,query_text text default '',after_cursor bigint default 0,page_size integer default 30) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t integration_tokens; result jsonb; next_cursor bigint;begin
select * into t from integration_tokens where hash=token_hash and revoked_at is null and expires_at>now();
if not found then raise exception 'Invalid integration token';end if;
if not(endpoint=any(t.scopes)) then raise exception 'Scope denied';end if;
update integration_tokens set last_used_at=now() where id=t.id;
page_size:=least(greatest(page_size,1),100);
if endpoint='changes' then
select coalesce(jsonb_agg(x.row order by x.cursor),'[]'::jsonb),max(x.cursor) into result,next_cursor from (
select ch.cursor,jsonb_build_object('id',ch.capture_id,'version',ch.version,'operation',case when m.id is not null then 'upsert' else 'delete' end,'memory',to_jsonb(m)-'owner_id') as row
from changes ch left join memory_view m on m.id=ch.capture_id and m.owner_id=t.owner_id and m.space_id=any(t.spaces) and not m.no_ai and m.deleted_at is null
where ch.owner_id=t.owner_id and ch.cursor>after_cursor and exists(select 1 from changes old where old.owner_id=t.owner_id and old.capture_id=ch.capture_id and old.space_id=any(t.spaces) and not old.no_ai)
order by ch.cursor limit page_size) x;
return jsonb_build_object('data',result,'next_cursor',coalesce(next_cursor,after_cursor));
elsif endpoint in ('memories','timeline','search','context') then
select coalesce(jsonb_agg(to_jsonb(x)-'owner_id'),'[]'::jsonb) into result from (select m.* from memory_view m where m.owner_id=t.owner_id and m.space_id=any(t.spaces) and not m.no_ai and m.deleted_at is null and (object_id is null or m.id=object_id) and (query_text='' or strpos(lower(m.text),lower(query_text))>0) order by m.captured_at desc,m.id limit page_size offset least(after_cursor,100000)) x;
elsif endpoint='entities' then
select coalesce(jsonb_agg(to_jsonb(x)-'owner_id'),'[]'::jsonb) into result from (select e.id,e.name,e.kind,e.space_id from entities e where e.owner_id=t.owner_id and e.space_id=any(t.spaces) and exists(select 1 from entity_links l join captures c on c.id=l.capture_id where l.entity_id=e.id and c.owner_id=t.owner_id and c.space_id=any(t.spaces) and not c.no_ai and c.deleted_at is null) order by e.id limit page_size offset least(after_cursor,100000)) x;
elsif endpoint in ('events','commitments') then
if endpoint='events' then
select coalesce(jsonb_agg(to_jsonb(x)-'owner_id'),'[]'::jsonb) into result from (select e.* from events e join captures c on c.id=e.capture_id where c.owner_id=t.owner_id and c.space_id=any(t.spaces) and not c.no_ai and c.deleted_at is null order by e.id limit page_size offset least(after_cursor,100000)) x;
else
select coalesce(jsonb_agg(to_jsonb(x)-'owner_id'),'[]'::jsonb) into result from (select e.* from commitments e join captures c on c.id=e.capture_id where c.owner_id=t.owner_id and c.space_id=any(t.spaces) and not c.no_ai and c.deleted_at is null and e.status='open' order by e.id limit page_size offset least(after_cursor,100000)) x;
end if;
else raise exception 'Unknown endpoint';end if;
return jsonb_build_object('data',result,'next_cursor',case when jsonb_array_length(result)=page_size then after_cursor+page_size else null end);
end $$;
revoke all on function public.integration_read(text,text,uuid,text,bigint,integer) from public,anon,authenticated;
grant execute on function public.integration_read(text,text,uuid,text,bigint,integer) to service_role;

create table public.imports(owner_id uuid not null references profiles,archive_id uuid not null,created_at timestamptz not null default now(),primary key(owner_id,archive_id));
alter table imports enable row level security;
create policy owner_read on imports for select to authenticated using(owner_id=auth.uid());
grant select on imports to authenticated;
create function public.restore_archive(archive_id uuid,dataset jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare t text;r jsonb;old jsonb;u uuid:=auth.uid();sid uuid;begin
if u is null then raise exception 'Authentication required';end if;
perform 1 from profiles where owner_id=u for update;
if exists(select 1 from imports i where i.owner_id=u and i.archive_id=restore_archive.archive_id) then return;end if;
-- Canonical archive restores are owner-bound; intentional cross-owner remapping is not implicit.
foreach t in array array['profiles','spaces','captures','revisions','entities','evidence','events','entity_links','aliases','claims','commitments','commitment_history','reminders','occasions','attachments'] loop
for r in select value from jsonb_array_elements(coalesce(dataset->t,'[]'::jsonb)) loop
if r->>'owner_id'<>u::text then raise exception 'Foreign-owner archive requires explicit remapping';end if;
if t='profiles' then
update profiles set display_name=r->>'display_name',timezone=r->>'timezone',ai_consent=(r->>'ai_consent')::boolean,no_ai_default=(r->>'no_ai_default')::boolean,default_space_id=(r->>'default_space_id')::uuid where owner_id=u;
continue;end if;
if t='reminders' then r:=r||jsonb_build_object('status','pending_review');end if;
if t='occasions' then r:=r||jsonb_build_object('auto_prepare',false);end if;
if t='attachments' then r:=r||jsonb_build_object('state','pending');end if;
if t='spaces' then
select id into sid from spaces where owner_id=u and name=r->>'name';
if sid is not null and sid<>(r->>'id')::uuid then
if exists(select 1 from captures where space_id=sid) then raise exception 'Space collision: restore into an empty account';end if;
update profiles set default_space_id=null where owner_id=u and default_space_id=sid;
delete from spaces where id=sid;
end if;
end if;
execute format('select to_jsonb(x) from public.%I x where id=$1',t) into old using (r->>'id')::uuid;
if old is not null then
if old<>r then raise exception 'Incompatible ID collision in %',t;end if;
else
execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I,$1)',t,t) using r;
if t='commitments' then delete from commitment_history where commitment_id=(r->>'id')::uuid and owner_id=u;end if;
end if;
end loop;end loop;
insert into imports(owner_id,archive_id) values(u,archive_id);
end $$;
revoke all on function public.restore_archive(uuid,jsonb) from public;
grant execute on function public.restore_archive(uuid,jsonb) to authenticated;
