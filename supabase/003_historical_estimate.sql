begin;
alter table public.tokens add column if not exists baseline_estimate jsonb;
alter table public.tokens drop constraint if exists tokens_baseline_source_check;
alter table public.tokens add constraint tokens_baseline_source_check check(baseline_source in ('auto','manual','unavailable','estimated'));
create or replace function public.add_token_v3(p_actor uuid,p_chain text,p_ca text,p_name text,p_symbol text,p_cap numeric,p_source text,p_fetched timestamptz,p_pair text,p_created timestamptz default null,p_estimate jsonb default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 result:=public.add_token_v2(p_actor,p_chain,p_ca,p_name,p_symbol,p_cap,p_source,p_fetched,p_pair,p_created);
 if not (result->>'existing')::boolean then update public.tokens set baseline_estimate=p_estimate where id=(result->>'id')::uuid;end if;
 return result;
end $$;
create or replace function public.edit_token_v2(p_actor uuid,p_id uuid,p_created timestamptz,p_cap numeric,p_estimate jsonb default null,p_manual boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare oldrow public.tokens;
begin
 perform pg_advisory_xact_lock(7142039);
 select * into oldrow from public.tokens where id=p_id;
 perform public.edit_token(p_actor,p_id,p_created,p_cap);
 if p_estimate is not null then
  update public.tokens set baseline_source='estimated',baseline_estimate=p_estimate,baseline_pair=p_estimate->>'pool',baseline_fetched_at=(p_estimate->>'referenceAt')::timestamptz where id=p_id;
 elsif p_manual or p_cap is distinct from oldrow.baseline_market_cap or p_created is distinct from oldrow.created_at then
  update public.tokens set baseline_source=case when p_cap is null then 'unavailable' else 'manual' end,baseline_estimate=null,baseline_pair=null,baseline_fetched_at=null where id=p_id;
 end if;
end $$;
create or replace function public.read_board() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('version',(select version::text from public.board_state where id=1),'tokens',coalesce((select jsonb_agg(jsonb_build_object('id',id,'chain',chain,'ca',ca,'name',name,'symbol',symbol,'created_at',created_at,'baseline_market_cap',baseline_market_cap::text,'baseline_source',baseline_source,'baseline_estimate',baseline_estimate,'archived_at',archived_at) order by created_at desc,id) from public.tokens),'[]'::jsonb))
$$;
revoke all on function public.add_token_v3(uuid,text,text,text,text,numeric,text,timestamptz,text,timestamptz,jsonb),public.edit_token_v2(uuid,uuid,timestamptz,numeric,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.add_token_v3(uuid,text,text,text,text,numeric,text,timestamptz,text,timestamptz,jsonb),public.edit_token_v2(uuid,uuid,timestamptz,numeric,jsonb,boolean) to service_role;
commit;
