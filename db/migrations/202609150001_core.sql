-- All privileged functions have a fixed search path and explicit grants.
create table public.invited_owners(email text primary key);
revoke all on public.invited_owners from anon, authenticated;
create table public.profiles(owner_id uuid primary key references auth.users(id) on delete cascade,display_name text not null default 'Alon',timezone text not null default 'Asia/Jerusalem',ai_consent boolean not null default false,no_ai_default boolean not null default true,default_space_id uuid,change_cursor bigint not null default 0);
create table public.spaces(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles on delete cascade,name text not null,unique(owner_id,id),unique(owner_id,name));
create table public.captures(id uuid primary key,owner_id uuid not null references public.profiles on delete cascade,space_id uuid not null,current_revision integer not null default 1,captured_at timestamptz not null,received_at timestamptz not null default now(),timezone text not null,occurred_on date,no_ai boolean not null default true,deleted_at timestamptz,processing_status text not null default 'Not sent to AI',original_payload_hash text not null,unique(owner_id,id),unique(owner_id,space_id,id),foreign key(owner_id,space_id) references public.spaces(owner_id,id));
create table public.revisions(id uuid primary key default gen_random_uuid(),owner_id uuid not null,capture_id uuid not null,number integer not null,text text not null check(length(text) between 1 and 100000),content_hash text not null,origin text not null default 'user',created_at timestamptz not null default now(),unique(capture_id,number),unique(owner_id,id),foreign key(owner_id,capture_id) references public.captures(owner_id,id) on delete cascade);
create table public.entities(id uuid primary key default gen_random_uuid(),owner_id uuid not null,space_id uuid not null,name text not null,kind text not null check(kind in ('person','organization','project','topic','place')),status text not null default 'proposed',unique(owner_id,space_id,id),foreign key(owner_id,space_id) references public.spaces(owner_id,id));
create table public.evidence(id uuid primary key default gen_random_uuid(),owner_id uuid not null,revision_id uuid not null,quote text not null,start_offset integer not null,end_offset integer not null,unique(owner_id,id),foreign key(owner_id,revision_id) references public.revisions(owner_id,id) on delete cascade);
create table public.events(id uuid primary key default gen_random_uuid(),owner_id uuid not null,space_id uuid not null,capture_id uuid not null,title text not null,state text not null check(state in ('happened','planned','cancelled')),occurred_on date,precision text not null default 'unknown',review_status text not null default 'needs_review',evidence_id uuid,unique(owner_id,space_id,id),foreign key(owner_id,space_id,capture_id) references public.captures(owner_id,space_id,id) on delete cascade,foreign key(owner_id,evidence_id) references public.evidence(owner_id,id));
create table public.entity_links(id uuid primary key default gen_random_uuid(),owner_id uuid not null,space_id uuid not null,entity_id uuid not null,capture_id uuid not null,role text,status text not null default 'proposed',foreign key(owner_id,space_id,entity_id) references public.entities(owner_id,space_id,id),foreign key(owner_id,space_id,capture_id) references public.captures(owner_id,space_id,id) on delete cascade);
create table public.aliases(id uuid primary key default gen_random_uuid(),owner_id uuid not null,space_id uuid not null,entity_id uuid not null,name text not null,verified boolean not null default false,foreign key(owner_id,space_id,entity_id) references public.entities(owner_id,space_id,id));
create table public.claims(id uuid primary key default gen_random_uuid(),owner_id uuid not null,space_id uuid not null,capture_id uuid not null,evidence_id uuid not null,description text not null,kind text not null default 'fact',review_status text not null default 'needs_review',supersedes uuid references public.claims(id),foreign key(owner_id,space_id,capture_id) references public.captures(owner_id,space_id,id) on delete cascade,foreign key(owner_id,evidence_id) references public.evidence(owner_id,id));
create table public.commitments(id uuid primary key default gen_random_uuid(),owner_id uuid not null,space_id uuid not null,capture_id uuid not null,description text not null,direction text not null check(direction in ('i_owe','waiting_for','idea')),due_on date,status text not null default 'proposed' check(status in ('proposed','open','done','cancelled')),evidence_id uuid,unique(owner_id,id),foreign key(owner_id,space_id,capture_id) references public.captures(owner_id,space_id,id) on delete cascade,foreign key(owner_id,evidence_id) references public.evidence(owner_id,id));
create table public.commitment_history(id uuid primary key default gen_random_uuid(),owner_id uuid not null,commitment_id uuid not null,status text not null,created_at timestamptz not null default now(),foreign key(owner_id,commitment_id) references public.commitments(owner_id,id) on delete cascade);
create table public.reminders(id uuid primary key default gen_random_uuid(),owner_id uuid not null,capture_id uuid not null,title text not null default 'A memory needs your attention',run_at timestamptz not null,timezone text not null,status text not null default 'scheduled' check(status in ('scheduled','cancelled','accepted','failed','pending_review')),schedule_revision integer not null default 1,unique(owner_id,id),foreign key(owner_id,capture_id) references public.captures(owner_id,id) on delete cascade);
create table public.occasions(id uuid primary key default gen_random_uuid(),owner_id uuid not null,space_id uuid not null,name text not null,month integer not null check(month between 1 and 12),day integer not null check(day between 1 and 31),birth_year integer,leap_policy text not null check(leap_policy in ('feb28','mar1')),foreign key(owner_id,space_id) references public.spaces(owner_id,id));
create table public.attachments(id uuid primary key default gen_random_uuid(),owner_id uuid not null,space_id uuid not null,capture_id uuid not null,storage_key text not null unique,name text not null,mime text not null,size bigint not null check(size between 0 and 10485760),sha256 text not null,state text not null default 'pending',foreign key(owner_id,space_id,capture_id) references public.captures(owner_id,space_id,id) on delete cascade);
create table public.search_chunks(id uuid primary key default gen_random_uuid(),owner_id uuid not null,revision_id uuid not null,chunk_offset integer not null,text text not null,model text,dimensions integer,embedding real[],foreign key(owner_id,revision_id) references public.revisions(owner_id,id) on delete cascade);
create table public.summaries(id uuid primary key default gen_random_uuid(),owner_id uuid not null,space_id uuid not null,text text not null,source_fingerprint text not null,stale boolean not null default false,created_at timestamptz not null default now(),foreign key(owner_id,space_id) references public.spaces(owner_id,id));
create table public.jobs(id uuid primary key default gen_random_uuid(),owner_id uuid not null,capture_id uuid,revision integer,kind text not null,logical_key text not null unique,status text not null default 'pending',run_at timestamptz not null default now(),attempts integer not null default 0,lease_until timestamptz,fence uuid,error_code text,foreign key(owner_id,capture_id) references public.captures(owner_id,id) on delete cascade);
create table public.push_subscriptions(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles,subscription jsonb not null,disabled boolean not null default false);
create table public.deliveries(id uuid primary key default gen_random_uuid(),owner_id uuid not null,reminder_id uuid not null,schedule_revision integer not null,subscription_id uuid not null references public.push_subscriptions,status text not null default 'pending',attempts integer not null default 0,lease_until timestamptz,fence uuid,accepted_at timestamptz,error_code text,unique(reminder_id,schedule_revision,subscription_id),foreign key(owner_id,reminder_id) references public.reminders(owner_id,id) on delete cascade);
create table public.integration_tokens(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles,hash text not null unique,prefix text not null,spaces uuid[] not null,scopes text[] not null,expires_at timestamptz not null,revoked_at timestamptz,last_used_at timestamptz);
create table public.changes(owner_id uuid not null references public.profiles,cursor bigint not null,capture_id uuid not null,operation text not null,space_id uuid not null,no_ai boolean not null,version integer not null,primary key(owner_id,cursor));
create table public.worker_health(id boolean primary key default true check(id),last_run timestamptz);
create index capture_timeline on public.captures(owner_id,occurred_on desc,captured_at desc,id) where deleted_at is null;
create index revision_search on public.revisions using gin(to_tsvector('simple',text));
create index jobs_due on public.jobs(status,run_at);
create index reminders_due on public.reminders(status,run_at);

do $$ declare t text; begin
foreach t in array array['profiles','spaces','captures','revisions','entities','evidence','events','entity_links','aliases','claims','commitments','commitment_history','reminders','occasions','attachments','search_chunks','summaries','jobs','push_subscriptions','deliveries','integration_tokens','changes'] loop
execute format('alter table public.%I enable row level security',t);
execute format('create policy owner_read on public.%I for select to authenticated using (owner_id = (select auth.uid()))',t);
execute format('grant select on public.%I to authenticated',t);
end loop;
foreach t in array array['entities','entity_links','aliases','commitments','reminders','occasions','attachments','push_subscriptions'] loop
execute format('create policy owner_write on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',t);
execute format('grant insert,update,delete on public.%I to authenticated',t);
end loop;
end $$;
alter table public.invited_owners enable row level security;
alter table public.worker_health enable row level security;
create policy private_health on public.worker_health for select to authenticated using(true);
grant select on public.worker_health to authenticated;
grant update(display_name,timezone,ai_consent,no_ai_default,default_space_id) on public.profiles to authenticated;
create policy profile_update on public.profiles for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());

create function public.provision_owner() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
if not exists(select 1 from invited_owners where lower(email)=lower(new.email)) then raise exception 'Owner not invited'; end if;
insert into profiles(owner_id) values(new.id);
insert into spaces(owner_id,name) values(new.id,'Private Inbox'),(new.id,'Work'),(new.id,'Personal');
update profiles set default_space_id=(select id from spaces where owner_id=new.id and name='Private Inbox') where owner_id=new.id;
return new; end $$;
create trigger provision_owner after insert on auth.users for each row execute function public.provision_owner();
revoke all on function public.provision_owner() from public;

create function public.log_capture_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare n bigint; begin
-- This row lock lasts until COMMIT: cursor allocation and commit order agree per owner.
update profiles set change_cursor=change_cursor+1 where owner_id=new.owner_id returning change_cursor into n;
insert into changes values(new.owner_id,n,new.id,case when new.deleted_at is null then 'upsert' else 'delete' end,new.space_id,new.no_ai,new.current_revision);
return new; end $$;
create trigger capture_change after insert or update on public.captures for each row execute function public.log_capture_change();
revoke all on function public.log_capture_change() from public;

create function public.save_capture(payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); cid uuid:=(payload->>'id')::uuid; fingerprint text:=encode(sha256(convert_to(payload::text,'UTF8')),'hex'); existing captures; p profiles;
begin
if u is null then raise exception 'Authentication required'; end if;
select * into p from profiles where owner_id=u for update;
if not found then raise exception 'Owner not provisioned'; end if;
select * into existing from captures where id=cid;
if found then
if existing.owner_id<>u then raise exception 'Forbidden'; end if;
if existing.original_payload_hash<>fingerprint then raise exception 'Idempotency conflict' using errcode='23505'; end if;
return existing.id; end if;
if not exists(select 1 from spaces where id=(payload->>'space_id')::uuid and owner_id=u) then raise exception 'Invalid space'; end if;
if length(trim(payload->>'text'))=0 or length(payload->>'text')>100000 then raise exception 'Invalid text'; end if;
insert into captures(id,owner_id,space_id,captured_at,timezone,occurred_on,no_ai,original_payload_hash,processing_status)
values(cid,u,(payload->>'space_id')::uuid,(payload->>'captured_at')::timestamptz,payload->>'timezone',(payload->>'occurred_on')::date,(payload->>'no_ai')::boolean,fingerprint,case when p.ai_consent and not (payload->>'no_ai')::boolean then 'AI unavailable' else 'Not sent to AI' end);
insert into revisions(owner_id,capture_id,number,text,content_hash) values(u,cid,1,payload->>'text',encode(sha256(convert_to(payload->>'text','UTF8')),'hex'));
insert into jobs(owner_id,capture_id,revision,kind,logical_key) values(u,cid,1,'extract',cid||':1:extract:v1');
return cid; end $$;
revoke all on function public.save_capture(jsonb) from public;
grant execute on function public.save_capture(jsonb) to authenticated;

create function public.mutate_capture(cid uuid,expected integer,new_text text default null,trash boolean default null,policy boolean default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c captures; begin
perform 1 from profiles where owner_id=auth.uid() for update;
select * into c from captures where id=cid and owner_id=auth.uid() for update;
if not found then raise exception 'Not found'; end if;
if c.current_revision<>expected then raise exception 'Revision conflict'; end if;
if new_text is not null then
if length(trim(new_text))=0 or length(new_text)>100000 then raise exception 'Invalid text'; end if;
insert into revisions(owner_id,capture_id,number,text,content_hash) values(c.owner_id,cid,expected+1,new_text,encode(sha256(convert_to(new_text,'UTF8')),'hex'));
end if;
update captures set current_revision=current_revision+case when new_text is null then 0 else 1 end,deleted_at=case when trash is null then deleted_at when trash then now() else null end,no_ai=coalesce(policy,no_ai),processing_status='Not sent to AI' where id=cid;
update jobs set status='dead',error_code='source_changed' where capture_id=cid and status<>'completed';
update summaries set stale=true where owner_id=c.owner_id;
delete from search_chunks where revision_id in (select id from revisions where capture_id=cid);
if trash=true then update reminders set status='cancelled',schedule_revision=schedule_revision+1 where capture_id=cid; end if;
end $$;
revoke all on function public.mutate_capture(uuid,integer,text,boolean,boolean) from public;
grant execute on function public.mutate_capture(uuid,integer,text,boolean,boolean) to authenticated;

create view public.memory_view with (security_invoker=true) as select c.id,c.owner_id,c.space_id,c.current_revision,c.captured_at,c.received_at,c.timezone,c.occurred_on,c.no_ai,c.deleted_at,c.processing_status,r.text from public.captures c join public.revisions r on r.capture_id=c.id and r.number=c.current_revision;
grant select on public.memory_view to authenticated;

create function public.commitment_audit() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin insert into commitment_history(owner_id,commitment_id,status) values(new.owner_id,new.id,new.status);return new;end $$;
create trigger commitment_audit after insert or update of status on public.commitments for each row execute function public.commitment_audit();
revoke all on function public.commitment_audit() from public;

create function public.claim_jobs(batch_size integer default 5) returns setof jobs language sql security definer set search_path=public,pg_temp as $$
update jobs set status='running',attempts=attempts+1,lease_until=now()+interval '60 seconds',fence=gen_random_uuid()
where id in(select id from jobs where ((status in ('pending','retry') and run_at<=now()) or (status='running' and lease_until<now())) and attempts<5 order by run_at for update skip locked limit least(batch_size,10)) returning *;
$$;
revoke all on function public.claim_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_jobs(integer) to service_role;
grant all on all tables in schema public to service_role;
