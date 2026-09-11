import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../lib/backend.mjs';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'test-only-secret'};
test('modern secret uses apikey, not a JWT Authorization header',async()=>{
 const modern={SUPABASE_URL:env.SUPABASE_URL,SUPABASE_ANON_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test'};
 let adminCalled=false;
 const fetcher=async(url,init)=>{if(url.endsWith('/auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111',email:'test@example.com'});if(url.includes('/members?'))return Response.json([{enabled:true,role:'admin'}]);if(url.endsWith('/rpc/delete_token')){adminCalled=true;assert.equal(init.headers.apikey,'sb_secret_test');assert.equal(init.headers.Authorization,undefined);return new Response(null,{status:204})}throw Error('Unexpected call')};
 const req=new Request('https://board.test/api/delete',{method:'POST',headers:{origin:'https://board.test','content-type':'application/json',cookie:'wb_access=user-jwt'},body:JSON.stringify({id:'22222222-2222-4222-8222-222222222222',confirmed:true})});
 assert.equal((await handle(req,modern,fetcher)).status,200);assert.equal(adminCalled,true);
});
const request=(path,body)=>new Request('https://board.test/api/'+path,body?{method:'POST',headers:{origin:'https://board.test','content-type':'application/json'},body:JSON.stringify(body)}:undefined);
test('unconfigured mode is explicit and writes do not pretend success',async()=>{assert.deepEqual(await(await handle(request('config'),{})).json(),{configured:false});assert.equal((await handle(request('tokens',{}),{})).status,503)});
test('cross-origin writes refused before any database request',async()=>{const r=await handle(new Request('https://board.test/api/tokens',{method:'POST',headers:{origin:'https://evil.test'}}),env,()=>{throw Error('must not fetch')});assert.equal(r.status,403)});
test('quotes only accept signed collected addresses, with zero database reads',async()=>{
 const ca='0x'+'a'.repeat(40);const boardFetch=async()=>Response.json({version:'1',tokens:[{id:'one',chain:'base',ca}]});const board=await(await handle(request('board'),env,boardFetch)).json();
 let calls=0;const quotesFetch=async(url)=>{calls++;assert.ok(url.startsWith('https://api.dexscreener.com/'));return Response.json([{chainId:'base',baseToken:{address:ca},liquidity:{usd:100},priceUsd:'1',marketCap:200}])};
 const result=await handle(request('quotes',{chain:'base',addresses:[ca],proofs:[board.tokens[0].proof]}),env,quotesFetch);assert.equal(result.status,200);assert.equal(calls,1);assert.equal((await result.json()).quotes[0].marketCap,200);
 const invalid=await handle(request('quotes',{chain:'base',addresses:['0x'+'b'.repeat(40)],proofs:[board.tokens[0].proof]}),env,quotesFetch);assert.equal(invalid.status,403);assert.equal(calls,1);
});
test('quote 429 includes backoff instruction',async()=>{const ca='0x'+'a'.repeat(40);const b=await(await handle(request('board'),env,async()=>Response.json({tokens:[{chain:'base',ca}]}))).json();const r=await handle(request('quotes',{chain:'base',addresses:[ca],proofs:[b.tokens[0].proof]}),env,async()=>new Response('',{status:429,headers:{'Retry-After':'120'}}));assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'120')});
