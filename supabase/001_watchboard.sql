-- Execute once in a new Supabase project's SQL Editor. No quote cache/history tables.
begin;
create table public.board_state(id integer primary key check(id=1), version bigint not null default 0);
insert into public.board_state values(1,0);
create table public.members(user_id uuid primary key references auth.users(id) on delete cascade, role text not null default 'member' check(role in ('member','admin')), enabled boolean not null default true);
create table public.tokens(
 id uuid primary key default gen_random_uuid(), chain text not null check(chain in ('ethereum','bsc','base','solana','robinhood')),
 ca text not null, name text not null default '', symbol text not null default '', created_at timestamptz not null default clock_timestamp(),
 created_by uuid not null references auth.users(id), baseline_market_cap numeric(36,12) check(baseline_market_cap>0),
 baseline_source text not null check(baseline_source in ('auto','manual','unavailable')), baseline_fetched_at timestamptz,
 baseline_pair text, archived_at timestamptz, unique(chain,ca),
 check((baseline_source='unavailable')=(baseline_market_cap is null)),
 check((chain='solana' and ca ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$') or (chain<>'solana' and ca ~ '^0x[0-9a-f]{40}$'))
);
create index tokens_created on public.tokens(created_at desc,id);
create table public.favorites(user_id uuid not null references auth.users(id) on delete cascade, token_id uuid not null references public.tokens(id),primary key(user_id,token_id));
create table public.audit_log(id bigint generated always as identity primary key,actor uuid not null,token_id uuid not null references public.tokens(id),action text not null,created_at timestamptz not null default clock_timestamp());
alter table public.board_state enable row level security;
alter table public.tokens enable row level security;
alter table public.members enable row level security;
alter table public.favorites enable row level security;
alter table public.audit_log enable row level security;
create policy state_read on public.board_state for select using(true);
create policy token_read on public.tokens for select using(true);
create policy own_member on public.members for select to authenticated using(user_id=auth.uid());
create policy own_favorites_read on public.favorites for select to authenticated using(user_id=auth.uid());
create policy own_favorites_insert on public.favorites for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.members where user_id=auth.uid() and enabled));
create policy own_favorites_delete on public.favorites for delete to authenticated using(user_id=auth.uid());
revoke all on public.tokens,public.board_state,public.members,public.favorites,public.audit_log from anon,authenticated;
grant select on public.tokens,public.board_state to anon,authenticated;
grant select on public.members to authenticated;
grant select,insert,delete on public.favorites to authenticated;
grant all on public.tokens,public.board_state,public.members,public.favorites,public.audit_log to service_role;
grant usage,select on all sequences in schema public to service_role;
create function public.protect_baseline() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.chain,new.ca,new.created_at,new.created_by,new.baseline_market_cap,new.baseline_source,new.baseline_fetched_at,new.baseline_pair) is distinct from row(old.chain,old.ca,old.created_at,old.created_by,old.baseline_market_cap,old.baseline_source,old.baseline_fetched_at,old.baseline_pair) then raise exception 'First inclusion is immutable'; end if;
 return new;
end $$;
create trigger immutable_baseline before update on public.tokens for each row execute function public.protect_baseline();
create function public.bump_board() returns trigger language plpgsql security definer set search_path=public as $$
begin update public.board_state set version=version+1 where id=1;return null;end $$;
create trigger board_changed after insert or update or delete on public.tokens for each row execute function public.bump_board();
create function public.read_board() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('version',(select version::text from public.board_state where id=1),'tokens',coalesce((select jsonb_agg(jsonb_build_object('id',id,'chain',chain,'ca',ca,'name',name,'symbol',symbol,'created_at',created_at,'baseline_market_cap',baseline_market_cap::text,'baseline_source',baseline_source,'archived_at',archived_at) order by created_at desc,id) from public.tokens),'[]'::jsonb))
$$;
revoke all on function public.read_board() from public;
grant execute on function public.read_board() to anon,authenticated,service_role;
create function public.add_token(p_actor uuid,p_chain text,p_ca text,p_name text,p_symbol text,p_cap numeric,p_source text,p_fetched timestamptz,p_pair text) returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.tokens; inserted boolean;
begin
 if not exists(select 1 from public.members where user_id=p_actor and enabled) then raise exception 'Member required';end if;
 perform pg_advisory_xact_lock(7142039);
 select * into item from public.tokens where chain=p_chain and ca=p_ca;
 if found then return jsonb_build_object('id',item.id,'existing',true);end if;
 if (select count(*) from public.tokens where archived_at is null)>=300 then raise exception 'Active limit reached (300)';end if;
 if (select count(*) from public.audit_log where actor=p_actor and action='add' and created_at>now()-interval '1 minute')>=10 then raise exception 'Please slow down';end if;
 insert into public.tokens(chain,ca,name,symbol,created_by,baseline_market_cap,baseline_source,baseline_fetched_at,baseline_pair) values(p_chain,p_ca,left(p_name,120),left(p_symbol,40),p_actor,p_cap,p_source,p_fetched,p_pair) returning * into item;
 insert into public.audit_log(actor,token_id,action) values(p_actor,item.id,'add');
 return jsonb_build_object('id',item.id,'existing',false);
end $$;
create function public.archive_token(p_actor uuid,p_id uuid,p_archived boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.members where user_id=p_actor and enabled and role='admin') then raise exception 'Administrator required';end if;
 perform pg_advisory_xact_lock(7142039);
 if not p_archived and exists(select 1 from public.tokens where id=p_id and archived_at is not null) and (select count(*) from public.tokens where archived_at is null)>=300 then raise exception 'Active limit reached (300)';end if;
 update public.tokens set archived_at=case when p_archived then clock_timestamp() else null end where id=p_id and (archived_at is not null) is distinct from p_archived;
 if found then insert into public.audit_log(actor,token_id,action) values(p_actor,p_id,case when p_archived then 'archive' else 'restore' end);end if;
end $$;
revoke all on function public.add_token(uuid,text,text,text,text,numeric,text,timestamptz,text),public.archive_token(uuid,uuid,boolean),public.protect_baseline(),public.bump_board() from public,anon,authenticated;
grant execute on function public.add_token(uuid,text,text,text,text,numeric,text,timestamptz,text),public.archive_token(uuid,uuid,boolean) to service_role;
commit;
