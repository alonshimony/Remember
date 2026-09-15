create function public.finish_extraction(job_id uuid,lease_token uuid,result jsonb) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare j jobs;c captures;r revisions;item jsonb;eid uuid;entity_id uuid;pos integer;begin
select * into j from jobs where id=job_id and fence=lease_token and status='running' and lease_until>now() for update;
if not found then return false;end if;
select * into c from captures where id=j.capture_id for update;
if c.deleted_at is not null or c.no_ai or c.current_revision<>j.revision or not exists(select 1 from profiles where owner_id=c.owner_id and ai_consent) then
update jobs set status='dead',error_code='stale_or_restricted' where id=j.id;return false;end if;
select * into r from revisions where capture_id=c.id and number=c.current_revision;
for item in select value from jsonb_array_elements(result->'events') loop
pos:=strpos(r.text,item->>'quote');if pos=0 then raise exception 'Invalid evidence';end if;
insert into evidence(owner_id,revision_id,quote,start_offset,end_offset) values(c.owner_id,r.id,item->>'quote',pos-1,pos-1+length(item->>'quote')) returning id into eid;
insert into events(owner_id,space_id,capture_id,title,state,occurred_on,precision,evidence_id) values(c.owner_id,c.space_id,c.id,item->>'title',item->>'state',(item->>'date')::date,item->>'precision',eid);
end loop;
for item in select value from jsonb_array_elements(result->'claims') loop
pos:=strpos(r.text,item->>'quote');if pos=0 or (item->>'source_id')::uuid<>c.id then raise exception 'Invalid evidence';end if;
insert into evidence(owner_id,revision_id,quote,start_offset,end_offset) values(c.owner_id,r.id,item->>'quote',pos-1,pos-1+length(item->>'quote')) returning id into eid;
insert into claims(owner_id,space_id,capture_id,evidence_id,description) values(c.owner_id,c.space_id,c.id,eid,item->>'text');
end loop;
for item in select value from jsonb_array_elements(result->'entities') loop
if strpos(r.text,item->>'quote')=0 then raise exception 'Invalid evidence';end if;
-- A same-name entity is deliberately NOT merged without owner confirmation.
insert into entities(owner_id,space_id,name,kind) values(c.owner_id,c.space_id,item->>'name',item->>'kind') returning id into entity_id;
insert into entity_links(owner_id,space_id,entity_id,capture_id) values(c.owner_id,c.space_id,entity_id,c.id);
end loop;
for item in select value from jsonb_array_elements(result->'commitments') loop
pos:=strpos(r.text,item->>'quote');if pos=0 then raise exception 'Invalid evidence';end if;
insert into evidence(owner_id,revision_id,quote,start_offset,end_offset) values(c.owner_id,r.id,item->>'quote',pos-1,pos-1+length(item->>'quote')) returning id into eid;
insert into commitments(owner_id,space_id,capture_id,description,direction,due_on,evidence_id,status) values(c.owner_id,c.space_id,c.id,item->>'description',item->>'direction',(item->>'due_on')::date,eid,'proposed');
end loop;
update captures set processing_status='Needs review' where id=c.id;
update jobs set status='completed',lease_until=null,error_code=null where id=j.id;
return true;end $$;
revoke all on function public.finish_extraction(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_extraction(uuid,uuid,jsonb) to service_role;

create function public.claim_deliveries() returns setof deliveries language plpgsql security definer set search_path=public,pg_temp as $$begin
insert into deliveries(owner_id,reminder_id,schedule_revision,subscription_id)
select r.owner_id,r.id,r.schedule_revision,s.id from reminders r join captures c on c.id=r.capture_id join push_subscriptions s on s.owner_id=r.owner_id and not s.disabled
where r.status='scheduled' and r.run_at<=now() and c.deleted_at is null on conflict do nothing;
return query update deliveries set status='running',attempts=attempts+1,lease_until=now()+interval '60 seconds',fence=gen_random_uuid()
where id in(select d.id from deliveries d join reminders r on r.id=d.reminder_id join captures c on c.id=r.capture_id where r.status='scheduled' and r.schedule_revision=d.schedule_revision and c.deleted_at is null and ((d.status in ('pending','retry') and (d.lease_until is null or d.lease_until<now())) or (d.status='running' and d.lease_until<now())) and d.attempts<5 order by r.run_at for update of d skip locked limit 5) returning *;
end $$;
revoke all on function public.claim_deliveries() from public,anon,authenticated;
grant execute on function public.claim_deliveries() to service_role;

create function public.finish_delivery(delivery_id uuid,lease_token uuid,accepted boolean,code text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare d deliveries;begin
select * into d from deliveries where id=delivery_id and fence=lease_token and status='running' and lease_until>now() for update;
if not found then return;end if;
update deliveries set status=case when accepted then 'accepted' when attempts>=5 then 'failed' else 'retry' end,accepted_at=case when accepted then now() else null end,error_code=code,lease_until=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)) where id=d.id;
if accepted then update reminders set status='accepted' where id=d.reminder_id and schedule_revision=d.schedule_revision and status='scheduled';end if;
end $$;
revoke all on function public.finish_delivery(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.finish_delivery(uuid,uuid,boolean,text) to service_role;

create function public.cancel_done_reminders() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
if new.status in ('done','cancelled') then update reminders set status='cancelled',schedule_revision=schedule_revision+1 where capture_id=new.capture_id and status='scheduled';end if;return new;end $$;
create trigger cancel_done_reminders after update of status on commitments for each row execute function public.cancel_done_reminders();
revoke all on function public.cancel_done_reminders() from public;
