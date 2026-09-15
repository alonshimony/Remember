-- Small private attachments live with their metadata in Neon; no third storage account.
create table if not exists public.file_objects (
  storage_key text primary key references public.attachments(storage_key) on delete cascade,
  owner_id uuid not null references public.profiles(owner_id) on delete cascade,
  content bytea not null check(octet_length(content) <= 3145728),
  mime text not null,
  constraint owned_key check(split_part(storage_key,'/',1)=owner_id::text)
);
alter table public.file_objects enable row level security;
create policy file_owner on public.file_objects for all to authenticated
  using(owner_id=auth.uid()) with check(owner_id=auth.uid() and exists(select 1 from public.attachments a where a.storage_key=file_objects.storage_key and a.owner_id=auth.uid()));
grant select,insert,update,delete on public.file_objects to authenticated;
