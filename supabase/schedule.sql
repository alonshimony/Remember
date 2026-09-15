-- Run only after setting project_url and worker_secret in Supabase Vault.
-- Values belong in Vault, never committed in this file.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('remember-worker','* * * * *',$$
select net.http_post(
url:=(select decrypted_secret from vault.decrypted_secrets where name='project_url')||'/functions/v1/worker',
headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='worker_secret')),
body:='{}'::jsonb,timeout_milliseconds:=55000);
$$);
