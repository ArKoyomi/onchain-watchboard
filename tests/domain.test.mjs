import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCA,manualCap,selectQuote,fetchQuotes} from '../lib/domain.mjs';
test('EVM lowercase; Solana case and byte length validation',()=>{assert.equal(normalizeCA('bsc','0x55d398326f99059fF775485246999027B3197955'),'0x55d398326f99059ff775485246999027b3197955');assert.equal(normalizeCA('solana','So11111111111111111111111111111111111111112'),'So11111111111111111111111111111111111111112');assert.throws(()=>normalizeCA('solana','abc'));assert.throws(()=>normalizeCA('other','0x123'));});
test('manual market cap is positive decimal, optional blank',()=>{assert.equal(manualCap(''),'');assert.equal(manualCap('123.45'),'123.45');for(const v of ['0','-1','NaN','Infinity','1e99'])assert.throws(()=>manualCap(v));});
test('select deep base pool, ignore quote-only matches and never use FDV',()=>{const ca='0x'+'a'.repeat(40);const pair=(address,l,cap)=>({chainId:'base',baseToken:{address,name:'A',symbol:'A'},quoteToken:{address:ca},liquidity:{usd:l},priceUsd:'1',marketCap:cap,fdv:999,priceChange:{h24:4},pairAddress:'pool'+l});const q=selectQuote([pair(ca,10,20),pair(ca,100,null),pair('0x'+'b'.repeat(40),10000,10000)],'base',ca);assert.equal(q.marketCap,null);assert.equal(q.pair,'pool100');assert.equal(q.change24h,4);});
test('missing pair stays missing',()=>assert.equal(selectQuote([],'base','0x'+'a'.repeat(40)).status,'missing'));
test('fetchQuotes uses the public browser-safe batch endpoint',async()=>{
 const ca='0x'+'a'.repeat(40);let requested='';
 const quotes=await fetchQuotes('base',[ca],async url=>{
  requested=url;
  return Response.json([{chainId:'base',baseToken:{address:ca,name:'A',symbol:'A'},liquidity:{usd:10},priceUsd:'1',marketCap:100}]);
 });
 assert.equal(requested,`https://api.dexscreener.com/tokens/v1/base/${ca}`);
 assert.equal(quotes[0].marketCap,100);
});
test('fetchQuotes exposes DEX retry timing without retrying',async()=>{
 let calls=0;
 await assert.rejects(fetchQuotes('solana',['So11111111111111111111111111111111111111112'],async()=>{
  calls++;
  return new Response('',{status:429,headers:{'Retry-After':'90'}});
 }),error=>error.status===429&&error.retryAfter==='90');
 assert.equal(calls,1);
});
