create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.push_clients (
  client_id text primary key,
  secret_hash text not null,
  subscription jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.scheduled_notifications (
  client_id text not null references public.push_clients(client_id) on delete cascade,
  notification_id text not null,
  fire_at timestamptz not null,
  title text not null,
  body text not null,
  tag text,
  target_url text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (client_id, notification_id)
);

create index if not exists scheduled_notifications_due_idx
  on public.scheduled_notifications (fire_at)
  where sent_at is null;

create table if not exists public.push_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.push_clients enable row level security;
alter table public.scheduled_notifications enable row level security;
alter table public.push_settings enable row level security;

revoke all on table public.push_clients from anon, authenticated;
revoke all on table public.scheduled_notifications from anon, authenticated;
revoke all on table public.push_settings from anon, authenticated;

insert into public.push_settings(key,value)
values ('cron_secret', encode(gen_random_bytes(32),'hex'))
on conflict (key) do nothing;

create or replace function public.invoke_emiruto_push_sender()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_secret text;
begin
  select value into v_secret from public.push_settings where key='cron_secret';
  if v_secret is null then
    raise exception 'cron_secret missing';
  end if;

  perform net.http_post(
    url := 'https://nxjbhgohenblohmtvysk.supabase.co/functions/v1/emiruto-push/internal/send-due',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret',v_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.invoke_emiruto_push_sender() from public, anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname='emiruto-push-every-minute'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'emiruto-push-every-minute',
    '* * * * *',
    'select public.invoke_emiruto_push_sender();'
  );
end
$$;
