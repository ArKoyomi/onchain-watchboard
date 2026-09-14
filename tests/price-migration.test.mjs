import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('price migration stores a public first price and isolates personal entry prices',async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
 for(const file of ['001_watchboard.sql','002_edit_delete.sql','003_historical_estimate.sql','004_price_baselines.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
 const admin='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222',ca='0x'+'a'.repeat(40);
 await db.query('insert into auth.users values($1),($2)',[admin,member]);
 await db.query("insert into members(user_id,role) values($1,'admin'),($2,'member')",[admin,member]);
 const result=await db.query("select add_token_v4($1,'base',$2,'A','A',1000,'auto',now(),'pool',null,null,0.25) as r",[admin,ca]);
 const id=result.rows[0].r.id;
 const board=(await db.query('select read_board() as b')).rows[0].b;
 assert.equal(Number(board.tokens[0].baseline_price_usd),0.25);
 await db.exec('set role authenticated');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[member]);
 await db.query('insert into user_entries(user_id,token_id,entry_price_usd) values($1,$2,$3)',[member,id,'0.5']);
 assert.equal(Number((await db.query('select entry_price_usd from user_entries')).rows[0].entry_price_usd),0.5);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 assert.equal((await db.query('select * from user_entries')).rows.length,0);
 await assert.rejects(db.query('insert into user_entries(user_id,token_id,entry_price_usd) values($1,$2,$3)',[member,id,'0.75']),/row-level security/);
 await db.close();
});
