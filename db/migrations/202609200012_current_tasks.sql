-- History is never deleted or silently marked done. This is an eligibility view for Ask.
create function public.current_task_sources(ai_only boolean default false)
returns setof jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with candidates as (
 select m.*, (now() at time zone p.timezone)::date as today,
   coalesce(m.occurred_on,(m.captured_at at time zone p.timezone)::date) as memory_day
 from memory_view m join profiles p on p.owner_id=m.owner_id
 where m.deleted_at is null and (not ai_only or (not m.no_ai and p.ai_consent))
), eligible as (
 select m.*, coalesce((
   select jsonb_agg(jsonb_build_object('id',c.id,'description',c.description,
     'status',c.status,'due_on',c.due_on,'quote',
     case when r.number=m.current_revision and strpos(m.text,e.quote)>0 then e.quote
          when strpos(m.text,c.description)>0 then c.description else null end) order by c.id)
   from commitments c left join evidence e on e.id=c.evidence_id
   left join revisions r on r.id=e.revision_id and r.capture_id=m.id
   where c.capture_id=m.id and c.status in ('open','proposed')
     and (c.due_on is null or c.due_on>=m.today)
     and (
       (m.memory_day between m.today-6 and m.today)
       or (c.status='open' and c.due_on>=m.today)
       or (c.status='open' and exists(select 1 from commitment_history h
            where h.commitment_id=c.id and h.status='open' and h.created_at>now()-interval '7 days'))
     )
 ),'[]'::jsonb) as action_evidence
 from candidates m
)
select (to_jsonb(m)-'today'-'memory_day') || jsonb_build_object('action_scope',
  case when jsonb_array_length(m.action_evidence)>0 then 'commitments' else 'recent_note' end)
from eligible m
where jsonb_array_length(m.action_evidence)>0
 or (m.memory_day between m.today-6 and m.today
     and not exists(select 1 from commitments c where c.capture_id=m.id))
order by m.captured_at desc,m.id limit 40;
$$;
revoke all on function public.current_task_sources(boolean) from public;
grant execute on function public.current_task_sources(boolean) to authenticated;
