create function public.search_memories(query_terms text[],ai_only boolean default false,result_limit integer default 20) returns setof memory_view language sql stable security invoker set search_path=public,pg_temp as $$
select m.* from memory_view m join profiles p on p.owner_id=m.owner_id where m.deleted_at is null and (not ai_only or (not m.no_ai and p.ai_consent)) and exists(select 1 from unnest(query_terms) q where strpos(lower(m.text),lower(q))>0) order by m.occurred_on desc nulls last,m.captured_at desc,m.id limit least(greatest(result_limit,1),50);
$$;
revoke all on function public.search_memories(text[],boolean,integer) from public;
grant execute on function public.search_memories(text[],boolean,integer) to authenticated;
create table public.ai_usage(owner_id uuid not null references profiles,day date not null default current_date,requests integer not null default 0,primary key(owner_id,day));
alter table ai_usage enable row level security;
create policy ai_usage_read on ai_usage for select to authenticated using(owner_id=auth.uid());
grant select on ai_usage to authenticated;
create function public.consume_ai_budget(daily_limit integer) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$ declare n integer;begin
if auth.uid() is null then raise exception 'Authentication required';end if;
insert into ai_usage(owner_id,day,requests) values(auth.uid(),current_date,1) on conflict(owner_id,day) do update set requests=ai_usage.requests+1 returning requests into n;
return n<=least(greatest(daily_limit,0),100);end $$;
revoke all on function public.consume_ai_budget(integer) from public;
grant execute on function public.consume_ai_budget(integer) to authenticated;
