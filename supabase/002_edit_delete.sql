begin;
-- Preserve identity; explicit administrator edits may change the baseline.
create or replace function public.protect_baseline() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.chain,new.ca,new.created_by) is distinct from row(old.chain,old.ca,old.created_by) then raise exception 'Token identity is immutable';end if;
 return new;
end $$;
alter table public.audit_log add column if not exists details jsonb;
-- Retain audit history after deleting the public record.
alter table public.audit_log drop constraint if exists audit_log_token_id_fkey;
create or replace function public.add_token_v2(p_actor uuid,p_chain text,p_ca text,p_name text,p_symbol text,p_cap numeric,p_source text,p_fetched timestamptz,p_pair text,p_created timestamptz default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 result:=public.add_token(p_actor,p_chain,p_ca,p_name,p_symbol,p_cap,p_source,p_fetched,p_pair);
 if not (result->>'existing')::boolean and p_created is not null then update public.tokens set created_at=p_created where id=(result->>'id')::uuid;end if;
 return result;
end $$;
create or replace function public.edit_token(p_actor uuid,p_id uuid,p_created timestamptz,p_cap numeric) returns void language plpgsql security definer set search_path=public as $$
declare oldrow public.tokens;
begin
 if not exists(select 1 from public.members where user_id=p_actor and enabled and role='admin') then raise exception 'Administrator required';end if;
 if p_created is null or (p_cap is not null and p_cap<=0) then raise exception 'Invalid baseline';end if;
 perform pg_advisory_xact_lock(7142039);
 select * into oldrow from public.tokens where id=p_id for update;if not found then raise exception 'Token not found';end if;
 update public.tokens set created_at=p_created,baseline_market_cap=p_cap,
 baseline_source=case when p_cap is not distinct from oldrow.baseline_market_cap then baseline_source when p_cap is null then 'unavailable' else 'manual' end,
 baseline_fetched_at=case when p_cap is not distinct from oldrow.baseline_market_cap then baseline_fetched_at else null end,
 baseline_pair=case when p_cap is not distinct from oldrow.baseline_market_cap then baseline_pair else null end where id=p_id;
 insert into public.audit_log(actor,token_id,action,details) values(p_actor,p_id,'edit',jsonb_build_object('before',jsonb_build_object('created_at',oldrow.created_at,'market_cap',oldrow.baseline_market_cap),'after',jsonb_build_object('created_at',p_created,'market_cap',p_cap)));
end $$;
create or replace function public.delete_token(p_actor uuid,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare oldrow public.tokens;
begin
 if not exists(select 1 from public.members where user_id=p_actor and enabled and role='admin') then raise exception 'Administrator required';end if;
 perform pg_advisory_xact_lock(7142039);
 select * into oldrow from public.tokens where id=p_id for update;if not found then return;end if;
 delete from public.favorites where token_id=p_id;
 delete from public.tokens where id=p_id;
 insert into public.audit_log(actor,token_id,action,details) values(p_actor,p_id,'delete',jsonb_build_object('chain',oldrow.chain,'ca',oldrow.ca,'created_at',oldrow.created_at,'market_cap',oldrow.baseline_market_cap));
end $$;
revoke all on function public.add_token_v2(uuid,text,text,text,text,numeric,text,timestamptz,text,timestamptz),public.edit_token(uuid,uuid,timestamptz,numeric),public.delete_token(uuid,uuid) from public,anon,authenticated;
grant execute on function public.add_token_v2(uuid,text,text,text,text,numeric,text,timestamptz,text,timestamptz),public.edit_token(uuid,uuid,timestamptz,numeric),public.delete_token(uuid,uuid) to service_role;
-- Existing archived rows return to the list; no user records are auto-deleted.
update public.tokens set archived_at=null where archived_at is not null;
commit;
