alter table integration_tokens add column rate_window timestamptz not null default now();
alter table integration_tokens add column rate_count integer not null default 0;
create function public.integration_rate_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
if new.last_used_at is distinct from old.last_used_at then
if old.rate_window<now()-interval '1 minute' then new.rate_window:=now();new.rate_count:=1;else new.rate_count:=old.rate_count+1;end if;
if new.rate_count>60 then raise exception 'Integration rate limit exceeded';end if;end if;return new;end $$;
create trigger integration_rate_guard before update on integration_tokens for each row execute function public.integration_rate_guard();
revoke all on function public.integration_rate_guard() from public;

-- Source revision chunking is Unicode-character based in PostgreSQL. Each chunk has
-- its own logical job key and stable source revision; offsets never use sync time.
alter table jobs add column chunk_start integer not null default 0;
alter table jobs add column chunk_end integer not null default 8000;
create function public.expand_capture_jobs() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare n integer;offset_value integer;begin
if new.kind<>'extract' or new.chunk_start<>0 then return new;end if;
select length(text) into n from revisions where capture_id=new.capture_id and number=new.revision;
if n>8000 then
for offset_value in select generate_series(8000,n-1,8000) loop
insert into jobs(owner_id,capture_id,revision,kind,logical_key,chunk_start,chunk_end) values(new.owner_id,new.capture_id,new.revision,'extract',new.logical_key||':chunk:'||offset_value,offset_value,least(n,offset_value+8000)) on conflict(logical_key) do nothing;
end loop;end if;return new;end $$;
create trigger expand_capture_jobs after insert on jobs for each row execute function public.expand_capture_jobs();
revoke all on function public.expand_capture_jobs() from public;

create function public.mark_derived_stale() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
if new.current_revision<>old.current_revision then
update events set review_status='stale_source' where capture_id=new.id;
update claims set review_status='stale_source' where capture_id=new.id;
end if;return new;end $$;
create trigger mark_derived_stale after update on captures for each row execute function public.mark_derived_stale();
revoke all on function public.mark_derived_stale() from public;

create table public.purge_audit(id uuid primary key,owner_id uuid not null,purged_at timestamptz not null default now());
alter table purge_audit enable row level security;
create policy owner_read on purge_audit for select to authenticated using(owner_id=auth.uid());
grant select on purge_audit to authenticated;
create function public.purge_capture(cid uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare c captures;begin
select * into c from captures where id=cid and owner_id=auth.uid() for update;
if not found or c.deleted_at is null then raise exception 'Only a trashed memory can be purged';end if;
if exists(select 1 from attachments where capture_id=cid and state<>'removed') then raise exception 'Remove attachment bytes first';end if;
insert into purge_audit(id,owner_id) values(cid,c.owner_id) on conflict do nothing;
delete from claims where capture_id=cid;
delete from events where capture_id=cid;
delete from commitments where capture_id=cid;
delete from entity_links where capture_id=cid;
delete from evidence where revision_id in(select id from revisions where capture_id=cid);
delete from captures where id=cid;
end $$;
revoke all on function public.purge_capture(uuid) from public;
grant execute on function public.purge_capture(uuid) to authenticated;
