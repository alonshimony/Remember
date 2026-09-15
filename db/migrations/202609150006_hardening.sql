-- Same-owner supersession and storage paths are database invariants, including imports.
alter table claims add constraint claims_owner_id_id_key unique(owner_id,id);
alter table claims drop constraint claims_supersedes_fkey;
alter table claims add constraint claims_supersedes_owner_fk foreign key(owner_id,supersedes) references claims(owner_id,id) deferrable initially deferred;
alter table attachments add constraint attachment_path_owner check(split_part(storage_key,'/',1)=owner_id::text and split_part(storage_key,'/',2)=capture_id::text and split_part(storage_key,'/',3)=id::text);
alter table occasions add constraint valid_month_day check(day<=case when month=2 then 29 when month in (4,6,9,11) then 30 else 31 end);

-- Atomic moves update source and dependent records together.
do $$ declare c record;begin for c in select conrelid::regclass tab,conname from pg_constraint where contype='f' and connamespace='public'::regnamespace loop execute format('alter table %s alter constraint %I deferrable initially immediate',c.tab,c.conname);end loop;end $$;
create function public.move_capture(cid uuid,destination uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare c captures;l record;n uuid;begin
perform 1 from profiles where owner_id=auth.uid() for update;
select * into c from captures where id=cid and owner_id=auth.uid() for update;if not found then raise exception 'Not found';end if;
if not exists(select 1 from spaces where id=destination and owner_id=auth.uid()) then raise exception 'Invalid destination';end if;
set constraints all deferred;
for l in select el.id,e.name,e.kind,e.status from entity_links el join entities e on e.id=el.entity_id where el.capture_id=cid loop
insert into entities(owner_id,space_id,name,kind,status) values(c.owner_id,destination,l.name,l.kind,l.status) returning id into n;
update entity_links set space_id=destination,entity_id=n where id=l.id;
end loop;
update events set space_id=destination where capture_id=cid;
update claims set space_id=destination where capture_id=cid;
update commitments set space_id=destination where capture_id=cid;
update attachments set space_id=destination where capture_id=cid;
update captures set space_id=destination where id=cid;
update summaries set stale=true where owner_id=c.owner_id;
update jobs set status='dead',error_code='scope_changed' where capture_id=cid and status<>'completed';
end $$;
revoke all on function public.move_capture(uuid,uuid) from public;
grant execute on function public.move_capture(uuid,uuid) to authenticated;

create function public.review_event(event_id uuid,new_title text,new_date date,new_state text) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare cid uuid;begin
update events set title=new_title,occurred_on=new_date,state=new_state,review_status='human_corrected' where id=event_id and owner_id=auth.uid() returning capture_id into cid;
if cid is null then raise exception 'Not found';end if;
update jobs set status='dead',error_code='human_correction' where capture_id=cid and status<>'completed';
end $$;
revoke all on function public.review_event(uuid,text,date,text) from public;
grant execute on function public.review_event(uuid,text,date,text) to authenticated;

create function public.worker_ai_budget(for_owner uuid,daily_limit integer) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$declare n integer;begin
insert into ai_usage(owner_id,day,requests) values(for_owner,current_date,1) on conflict(owner_id,day) do update set requests=ai_usage.requests+1 returning requests into n;
return n<=least(greatest(daily_limit,0),100);end $$;
revoke all on function public.worker_ai_budget(uuid,integer) from public,anon,authenticated;
grant execute on function public.worker_ai_budget(uuid,integer) to service_role;

create function public.timeline_page(before_time timestamptz default null,before_id uuid default null,filter_space uuid default null,query_text text default '',date_from date default null,date_to date default null,before_day date default null) returns setof memory_view language sql stable security invoker set search_path=public,pg_temp as $$
select m.* from memory_view m where m.deleted_at is null and (filter_space is null or m.space_id=filter_space) and (query_text='' or strpos(lower(m.text),lower(query_text))>0) and (date_from is null or coalesce(m.occurred_on,(m.captured_at at time zone m.timezone)::date)>=date_from) and (date_to is null or coalesce(m.occurred_on,(m.captured_at at time zone m.timezone)::date)<=date_to) and (before_time is null or (coalesce(m.occurred_on,(m.captured_at at time zone m.timezone)::date),m.captured_at,m.id)<(before_day,before_time,before_id)) order by coalesce(m.occurred_on,(m.captured_at at time zone m.timezone)::date) desc,m.captured_at desc,m.id desc limit 30;
$$;
revoke all on function public.timeline_page(timestamptz,uuid,uuid,text,date,date,date) from public;
grant execute on function public.timeline_page(timestamptz,uuid,uuid,text,date,date,date) to authenticated;

create function public.retry_processing(cid uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare c captures;begin
select * into c from captures where id=cid and owner_id=auth.uid();if not found or c.deleted_at is not null then raise exception 'Not found';end if;
if c.no_ai or not exists(select 1 from profiles where owner_id=c.owner_id and ai_consent) then raise exception 'External AI not permitted';end if;
if exists(select 1 from jobs where logical_key=c.id||':'||c.current_revision||':extract:v1' and status='completed' and error_code is distinct from 'not_sent_to_ai') then raise exception 'This revision was already organized; correct the source before reprocessing';end if;
insert into jobs(owner_id,capture_id,revision,kind,logical_key) values(c.owner_id,c.id,c.current_revision,'extract',c.id||':'||c.current_revision||':extract:v1') on conflict(logical_key) do update set status='pending',attempts=0,run_at=now(),fence=null where jobs.status in ('dead','retry') or jobs.error_code='not_sent_to_ai';
end $$;
revoke all on function public.retry_processing(uuid) from public;
grant execute on function public.retry_processing(uuid) to authenticated;
