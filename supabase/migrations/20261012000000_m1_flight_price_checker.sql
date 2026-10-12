-- M1 flight price checker on Supabase.
-- Stands in for the course's AWS pieces, which the AWS organization SCP blocks:
-- DynamoDB -> tables, S3 routes config -> flight_routes, SQS -> pgmq, EventBridge -> pg_cron.
create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- subscriptions (DynamoDB PK email, SK route). No subscription_status in M1; the paywall is M2.
create table public.subscriptions (
  email        text not null,
  route        text not null check (route in ('TPE-TYO', 'TPE-SEL')),
  plan_name    text not null check (plan_name in ('tokyo', 'seoul')),
  origin       text not null,
  destination  text not null,
  target_price numeric not null check (target_price > 0),
  currency     text not null default 'TWD',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (email, route)
);

-- notification_history: dedup/audit, pk = "{email}#{route}", newest sent_at wins.
create table public.notification_history (
  pk       text not null,
  sent_at  timestamptz not null default now(),
  email    text not null,
  route    text not null,
  price    numeric not null,
  currency text not null,
  primary key (pk, sent_at)
);

-- flight_routes: admin-managed routes config (was flight-routes.json in S3).
create table public.flight_routes (
  plan        text primary key,
  origin      text not null,
  destination text not null
);
insert into public.flight_routes values ('tokyo', 'TPE', 'TYO'), ('seoul', 'TPE', 'SEL');

-- Only Edge Functions (service role) touch these tables; the browser has no direct access.
alter table public.subscriptions enable row level security;
alter table public.notification_history enable row level security;
alter table public.flight_routes enable row level security;

-- flight_fare_queue (was SQS flight-fare-queue), wrapped so Edge Functions can call it via RPC.
select pgmq.create('flight_fare_queue');

create function public.fare_queue_send(msg jsonb) returns bigint
language sql security definer set search_path = '' as
$$ select pgmq.send('flight_fare_queue', msg) $$;

create function public.fare_queue_read(n int, vt int)
returns table (msg_id bigint, read_ct int, message jsonb)
language sql security definer set search_path = '' as
$$ select r.msg_id, r.read_ct, r.message from pgmq.read('flight_fare_queue', vt, n) r $$;

create function public.fare_queue_delete(id bigint) returns boolean
language sql security definer set search_path = '' as
$$ select pgmq.delete('flight_fare_queue', id) $$;

revoke all on function public.fare_queue_send(jsonb), public.fare_queue_read(int, int),
  public.fare_queue_delete(bigint) from public, anon, authenticated;
grant execute on function public.fare_queue_send(jsonb), public.fare_queue_read(int, int),
  public.fare_queue_delete(bigint) to service_role;

-- Every 30 minutes (was the EventBridge rule flight-price-check).
-- Change frequency: select cron.alter_job((select jobid from cron.job where jobname = 'flight-price-check'), schedule => '*/15 * * * *');
select cron.schedule(
  'flight-price-check',
  '*/30 * * * *',
  $$ select net.http_post(
       url := 'https://xkamsmqpaqhqhauddrov.supabase.co/functions/v1/flight-parser-wrapper',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ) $$
);
