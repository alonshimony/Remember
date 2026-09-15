create extension if not exists vector with schema extensions;
create table public.embeddings(revision_id uuid primary key,owner_id uuid not null,model text not null,dimensions integer not null check(dimensions=1536),embedding extensions.vector(1536) not null,created_at timestamptz not null default now(),foreign key(owner_id,revision_id) references revisions(owner_id,id) on delete cascade);
alter table embeddings enable row level security;
create policy embedding_owner on embeddings for select to authenticated using(owner_id=auth.uid());
grant select on embeddings to authenticated;
grant all on embeddings to service_role;
create function public.semantic_memories(query_embedding extensions.vector(1536),embedding_model text,result_limit integer default 12) returns setof memory_view language sql stable security invoker set search_path=public,extensions,pg_temp as $$
select m.* from embeddings e join revisions r on r.id=e.revision_id join memory_view m on m.id=r.capture_id join profiles p on p.owner_id=m.owner_id where e.owner_id=auth.uid() and e.model=embedding_model and e.dimensions=1536 and r.number=m.current_revision and m.deleted_at is null and not m.no_ai and p.ai_consent order by e.embedding <=> query_embedding limit least(greatest(result_limit,1),30);
$$;
revoke all on function public.semantic_memories(extensions.vector,text,integer) from public;
grant execute on function public.semantic_memories(extensions.vector,text,integer) to authenticated;
create function public.store_embedding(cid uuid,source_revision integer,embedding_model text,value extensions.vector(1536)) returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$declare c captures;rid uuid;begin
select * into c from captures where id=cid for update;if not found or c.deleted_at is not null or c.no_ai or c.current_revision<>source_revision or not exists(select 1 from profiles where owner_id=c.owner_id and ai_consent) then return false;end if;
select id into rid from revisions where capture_id=cid and number=source_revision;
insert into embeddings(revision_id,owner_id,model,dimensions,embedding) values(rid,c.owner_id,embedding_model,1536,value) on conflict(revision_id) do update set model=excluded.model,embedding=excluded.embedding,created_at=now();return true;end $$;
revoke all on function public.store_embedding(uuid,integer,text,extensions.vector) from public,anon,authenticated;
grant execute on function public.store_embedding(uuid,integer,text,extensions.vector) to service_role;
create function public.invalidate_embedding() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
if new.current_revision<>old.current_revision or new.no_ai or new.deleted_at is not null or new.space_id<>old.space_id then delete from embeddings where revision_id in(select id from revisions where capture_id=new.id);end if;return new;end $$;
create trigger invalidate_embedding after update on captures for each row execute function public.invalidate_embedding();
revoke all on function public.invalidate_embedding() from public;
