alter table push_subscriptions add constraint push_endpoint_allowed check(subscription->>'endpoint' ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/');
alter table reminders add column commitment_id uuid;
alter table reminders add constraint reminder_commitment_owner foreign key(owner_id,commitment_id) references commitments(owner_id,id) on delete cascade;
create or replace function public.cancel_done_reminders() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
if new.status in ('done','cancelled') then update reminders set status='cancelled',schedule_revision=schedule_revision+1 where commitment_id=new.id and status='scheduled';end if;return new;end $$;
-- Store approved notification preferences; no permission request is made at first render.
alter table profiles add column reminder_defaults_approved boolean not null default false;
alter table profiles add column reminder_time time not null default '09:00';
alter table profiles add column quiet_start time not null default '22:00';
alter table profiles add column quiet_end time not null default '08:00';
grant update(reminder_defaults_approved,reminder_time,quiet_start,quiet_end) on profiles to authenticated;
alter table occasions add column auto_prepare boolean not null default false;
alter table occasions add column preparation_days integer[] not null default array[30,7,1];

create function public.schedule_birthday(occasion_id uuid,for_year integer,preparation_days integer[]) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare o occasions;p profiles;d date;cid uuid;sid uuid;ct uuid;days integer;run timestamptz;begin
select * into p from profiles where owner_id=auth.uid() for update;
select * into o from occasions where id=occasion_id and owner_id=auth.uid();if not found then raise exception 'Not found';end if;
if not p.reminder_defaults_approved then raise exception 'Approve reminder defaults first';end if;
if for_year<extract(year from now()) or for_year>extract(year from now())+2 then raise exception 'Year outside preparation range';end if;
if cardinality(preparation_days)>5 or exists(select 1 from unnest(preparation_days) x where x<0 or x>365) then raise exception 'Invalid preparation offsets';end if;
update occasions set auto_prepare=true,preparation_days=schedule_birthday.preparation_days where id=o.id;
begin d:=make_date(for_year,o.month,o.day);exception when datetime_field_overflow then d:=case when o.leap_policy='feb28' then make_date(for_year,2,28) else make_date(for_year,3,1) end;end;
cid:=overlay(overlay(md5(o.id::text||':'||for_year) placing '5' from 13 for 1) placing '8' from 17 for 1)::uuid;
if exists(select 1 from captures where id=cid and owner_id=o.owner_id) then return cid;end if;
perform save_capture(jsonb_build_object('id',cid,'space_id',o.space_id,'text',o.name||' — annual birthday preparation for '||for_year||'. Gregorian date: '||d||'. Owner-approved preparation template.','captured_at',now(),'timezone',p.timezone,'occurred_on',d,'no_ai',true));
foreach days in array preparation_days loop
insert into commitments(owner_id,space_id,capture_id,description,direction,due_on,status) values(o.owner_id,o.space_id,cid,'Prepare for '||o.name||' ('||days||' days before)','i_owe',d-days,'open') returning id into ct;
run:=((d-days)+p.reminder_time) at time zone p.timezone;
if p.quiet_start>p.quiet_end then
if p.reminder_time>=p.quiet_start then run:=((d-days+1)+p.quiet_end) at time zone p.timezone;elsif p.reminder_time<p.quiet_end then run:=((d-days)+p.quiet_end) at time zone p.timezone;end if;
elsif p.reminder_time>=p.quiet_start and p.reminder_time<p.quiet_end then run:=((d-days)+p.quiet_end) at time zone p.timezone;end if;
insert into reminders(owner_id,capture_id,commitment_id,run_at,timezone,status) values(o.owner_id,cid,ct,run,p.timezone,case when run>now() then 'scheduled' else 'pending_review' end);
end loop;return cid;end $$;
revoke all on function public.schedule_birthday(uuid,integer,integer[]) from public;
grant execute on function public.schedule_birthday(uuid,integer,integer[]) to authenticated;
create function public.materialize_birthdays() returns void language plpgsql security definer set search_path=public,pg_temp as $$declare o record;y integer;begin
for o in select oc.*,p.timezone from occasions oc join profiles p on p.owner_id=oc.owner_id where oc.auto_prepare and p.reminder_defaults_approved limit 100 loop
perform set_config('request.jwt.claim.sub',o.owner_id::text,true);
y:=extract(year from now() at time zone o.timezone)::integer;
perform schedule_birthday(o.id,y,o.preparation_days);
perform schedule_birthday(o.id,y+1,o.preparation_days);
end loop;end $$;
revoke all on function public.materialize_birthdays() from public,anon,authenticated;
grant execute on function public.materialize_birthdays() to service_role;
