begin;

alter table public.tokens add column if not exists baseline_price_usd numeric check(baseline_price_usd>0);

-- Historical estimates already contain the minute close used at collection time.
update public.tokens
set baseline_price_usd=(baseline_estimate->>'historicalPrice')::numeric
where baseline_price_usd is null
  and baseline_estimate ? 'historicalPrice'
  and (baseline_estimate->>'historicalPrice')::numeric>0;

create table if not exists public.user_entries(
 user_id uuid not null references auth.users(id) on delete cascade,
 token_id uuid not null references public.tokens(id) on delete cascade,
 entry_price_usd numeric not null check(entry_price_usd>0),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,token_id)
);

alter table public.user_entries enable row level security;
create policy own_entries_read on public.user_entries for select to authenticated using(user_id=auth.uid());
create policy own_entries_insert on public.user_entries for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.members where user_id=auth.uid() and enabled));
create policy own_entries_update on public.user_entries for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.members where user_id=auth.uid() and enabled));
create policy own_entries_delete on public.user_entries for delete to authenticated using(user_id=auth.uid());
revoke all on public.user_entries from anon,authenticated;
grant select,insert,update,delete on public.user_entries to authenticated;
grant all on public.user_entries to service_role;

create or replace function public.add_token_v4(p_actor uuid,p_chain text,p_ca text,p_name text,p_symbol text,p_cap numeric,p_source text,p_fetched timestamptz,p_pair text,p_created timestamptz default null,p_estimate jsonb default null,p_price numeric default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if p_price is not null and p_price<=0 then raise exception 'Invalid first price';end if;
 result:=public.add_token_v3(p_actor,p_chain,p_ca,p_name,p_symbol,p_cap,p_source,p_fetched,p_pair,p_created,p_estimate);
 if not (result->>'existing')::boolean then update public.tokens set baseline_price_usd=p_price where id=(result->>'id')::uuid;end if;
 return result;
end $$;

create or replace function public.edit_token_v3(p_actor uuid,p_id uuid,p_created timestamptz,p_cap numeric,p_estimate jsonb default null,p_manual boolean default false,p_price numeric default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_price is not null and p_price<=0 then raise exception 'Invalid first price';end if;
 perform public.edit_token_v2(p_actor,p_id,p_created,p_cap,p_estimate,p_manual);
 update public.tokens set baseline_price_usd=p_price where id=p_id;
end $$;

create or replace function public.read_board() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('version',(select version::text from public.board_state where id=1),'tokens',coalesce((select jsonb_agg(jsonb_build_object('id',id,'chain',chain,'ca',ca,'name',name,'symbol',symbol,'created_at',created_at,'baseline_market_cap',baseline_market_cap::text,'baseline_price_usd',baseline_price_usd::text,'baseline_source',baseline_source,'baseline_estimate',baseline_estimate,'archived_at',archived_at) order by created_at desc,id) from public.tokens),'[]'::jsonb))
$$;

revoke all on function public.add_token_v4(uuid,text,text,text,text,numeric,text,timestamptz,text,timestamptz,jsonb,numeric),public.edit_token_v3(uuid,uuid,timestamptz,numeric,jsonb,boolean,numeric) from public,anon,authenticated;
grant execute on function public.add_token_v4(uuid,text,text,text,text,numeric,text,timestamptz,text,timestamptz,jsonb,numeric),public.edit_token_v3(uuid,uuid,timestamptz,numeric,jsonb,boolean,numeric) to service_role;

commit;
