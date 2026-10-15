-- Run once in the Supabase SQL Editor. Enable Anonymous Sign-ins in Auth.
create table if not exists public.kkuri_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (display_name ~ '^[가-힣A-Za-z0-9_]{2,12}$'),
  name_key text generated always as (lower(normalize(display_name, NFKC))) stored unique,
  best_score integer not null default 0 check (best_score between 0 and 9000),
  total_play_ms bigint not null default 0 check (total_play_ms >= 0),
  best_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists kkuri_profiles_score on public.kkuri_profiles (best_score desc, best_at);
create index if not exists kkuri_profiles_time on public.kkuri_profiles (total_play_ms desc);
create table if not exists public.kkuri_runs (
  id uuid primary key,
  profile_id uuid not null references public.kkuri_profiles(id) on delete cascade,
  score integer not null default 0 check (score between 0 and 9000),
  play_ms integer not null default 0 check (play_ms between 0 and 90000),
  finished boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.kkuri_profiles enable row level security;
alter table public.kkuri_runs enable row level security;
revoke all on public.kkuri_profiles, public.kkuri_runs from anon, authenticated;

create or replace function public.kkuri_register_player(p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text := pg_catalog.normalize(btrim(p_name), 'NFKC');
  v_profile public.kkuri_profiles;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_name is null or v_name !~ '^[가-힣A-Za-z0-9_]{2,12}$' then raise exception 'INVALID_NAME'; end if;
  insert into public.kkuri_profiles(owner_id, display_name) values (auth.uid(), v_name)
    on conflict (name_key) do nothing;
  select * into v_profile from public.kkuri_profiles where name_key = lower(v_name);
  if v_profile.owner_id <> auth.uid() then raise exception 'ID_TAKEN'; end if;
  return jsonb_build_object('profile_id', v_profile.id, 'display_name', v_profile.display_name,
    'best_score', v_profile.best_score, 'total_play_ms', v_profile.total_play_ms);
end $$;

-- A run UUID is reused for all progress updates and retries. Count only the delta.
create or replace function public.kkuri_save_run(p_profile_id uuid, p_run_id uuid,
  p_score integer, p_play_ms integer, p_finished boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.kkuri_profiles;
  v_run public.kkuri_runs;
  v_delta integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_score is null or p_score not between 0 and 9000 or p_play_ms is null
    or p_play_ms not between 0 and 90000 or p_finished is null or p_run_id is null then
    raise exception 'INVALID_RUN';
  end if;
  select * into v_profile from public.kkuri_profiles
    where id = p_profile_id and owner_id = auth.uid() for update;
  if not found then raise exception 'PLAYER_NOT_OWNED'; end if;
  insert into public.kkuri_runs(id, profile_id) values (p_run_id, p_profile_id) on conflict (id) do nothing;
  select * into v_run from public.kkuri_runs where id = p_run_id for update;
  if v_run.profile_id <> p_profile_id then raise exception 'RUN_NOT_OWNED'; end if;
  if not v_run.finished and p_play_ms >= v_run.play_ms then
    v_delta := p_play_ms - v_run.play_ms;
    update public.kkuri_runs set score = p_score, play_ms = p_play_ms, finished = p_finished
      where id = p_run_id returning * into v_run;
    update public.kkuri_profiles set total_play_ms = total_play_ms + v_delta,
      best_at = case when p_finished and p_score > best_score then now() else best_at end,
      best_score = case when p_finished then greatest(best_score, p_score) else best_score end
      where id = p_profile_id returning * into v_profile;
  end if;
  return jsonb_build_object('profile_id', v_profile.id, 'display_name', v_profile.display_name,
    'best_score', v_profile.best_score, 'total_play_ms', v_profile.total_play_ms,
    'run_play_ms', v_run.play_ms, 'run_finished', v_run.finished);
end $$;

create or replace function public.kkuri_leaderboard(p_sort text default 'score')
returns table(rank bigint, display_name text, best_score integer, total_play_ms bigint)
language sql stable security definer set search_path = '' as $$
  select rank() over (order by case when p_sort = 'time' then p.total_play_ms else p.best_score::bigint end desc),
    p.display_name, p.best_score, p.total_play_ms
  from public.kkuri_profiles p
  where p_sort in ('score', 'time') and
    (case when p_sort = 'time' then p.total_play_ms > 0 else p.best_score > 0 end)
  order by case when p_sort = 'time' then p.total_play_ms else p.best_score::bigint end desc,
    p.best_at asc, p.name_key asc
  limit 100
$$;
revoke all on function public.kkuri_register_player(text) from public;
revoke all on function public.kkuri_save_run(uuid, uuid, integer, integer, boolean) from public;
revoke all on function public.kkuri_leaderboard(text) from public;
grant execute on function public.kkuri_register_player(text) to authenticated;
grant execute on function public.kkuri_save_run(uuid, uuid, integer, integer, boolean) to authenticated;
grant execute on function public.kkuri_leaderboard(text) to anon, authenticated;
