import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../lib/backend.mjs';

const env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public',SUPABASE_SECRET_KEY:'sb_secret_test'};
const id='22222222-2222-4222-8222-222222222222';
const request=(path,body)=>new Request('https://board.test/api/'+path,body?{method:'POST',headers:{origin:'https://board.test',cookie:'wb_access=user-jwt','content-type':'application/json'},body:JSON.stringify(body)}:{headers:{cookie:'wb_access=user-jwt'}});

function authenticatedFetcher(onWrite){return async(url,init={})=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111',email:'member@watchboard.invalid'});
 if(url.includes('/members?'))return Response.json([{enabled:true,role:'member'}]);
 if(url.includes('/favorites?')&&init.method==='POST'){onWrite?.(url,init);return new Response(null,{status:204})}
 if(url.includes('/favorites?'))return Response.json([{token_id:id}]);
 if(url.includes('/user_entries?')&&init.method==='GET')return Response.json([{token_id:id,entry_price_usd:'0.00025'}]);
 if(url.includes('/user_entries?')&&['POST','DELETE'].includes(init.method)){onWrite?.(url,init);return new Response(null,{status:204})}
 throw Error('Unexpected request '+url);
}}

test('signed-in account receives only its personal entry prices with account data',async()=>{
 const response=await handle(request('me'),env,authenticatedFetcher());
 assert.equal(response.status,200);
 const data=await response.json();
 assert.deepEqual(data.entryPrices,{[id]:'0.00025'});
 assert.deepEqual(data.favorites,[id]);
});

test('personal entry price can be saved and cleared for the signed-in account',async()=>{
 const writes=[];const fetcher=authenticatedFetcher((url,init)=>writes.push({url,method:init.method,body:init.body,prefer:init.headers.Prefer}));
 let response=await handle(request('entry-price',{id,price:'0.00025'}),env,fetcher);
 assert.equal(response.status,200);
 assert.equal(writes[0].method,'POST');
 assert.equal(writes[0].prefer,'resolution=merge-duplicates,return=minimal');
 assert.deepEqual(JSON.parse(writes[0].body),{user_id:'11111111-1111-4111-8111-111111111111',token_id:id,entry_price_usd:'0.00025'});
 response=await handle(request('entry-price',{id,price:''}),env,fetcher);
 assert.equal(response.status,200);
 assert.equal(writes[1].method,'DELETE');
 assert.match(writes[1].url,/user_id=eq\.11111111/);
 response=await handle(request('entry-price',{id,price:'0'}),env,fetcher);
 assert.equal(response.status,400);
});

test('enabling a favorite ignores duplicates instead of requiring update permission',async()=>{
 const writes=[];const fetcher=authenticatedFetcher((url,init)=>writes.push({url,method:init.method,prefer:init.headers.Prefer}));
 const response=await handle(request('favorites',{id,enabled:true}),env,fetcher);
 assert.equal(response.status,200);
 assert.equal(writes[0].method,'POST');
 assert.equal(writes[0].prefer,'resolution=ignore-duplicates,return=minimal');
});
