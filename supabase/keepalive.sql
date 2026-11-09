create table if not exists public.keepalive_heartbeats (
  id int primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now()
);

comment on table public.keepalive_heartbeats is 'Time of the last keep-alive ping from supabase-edge-ping. Always a single row, written by public.keepalive().';

alter table public.keepalive_heartbeats enable row level security;

create or replace function public.keepalive()
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  insert into public.keepalive_heartbeats (id, pinged_at)
  values (1, now())
  on conflict (id) do update set pinged_at = excluded.pinged_at
  returning pinged_at;
$$;

revoke execute on function public.keepalive() from public, authenticated;
grant execute on function public.keepalive() to anon, service_role;
