import test from 'node:test';
import assert from 'node:assert/strict';
import {retryDelayMs,mergeQuoteBatch,quoteFailure,secondsUntil} from '../lib/quote-refresh.mjs';

test('retry delay follows Retry-After within 60–3600 seconds',()=>{
 assert.equal(retryDelayMs({retryAfter:'90'}),90000);
 assert.equal(retryDelayMs({retryAfter:'2'}),60000);
 assert.equal(retryDelayMs({retryAfter:'9999'}),3600000);
 assert.equal(retryDelayMs({}),60000);
});

test('missing quotes retain the previous value as stale',()=>{
 const previous={'base:a':{ca:'a',price:1,marketCap:100,status:'ok'}};
 const next=mergeQuoteBatch(previous,'base',[{ca:'a',price:null,marketCap:null,status:'missing'}]);
 assert.deepEqual(next['base:a'],{ca:'a',price:1,marketCap:100,status:'stale'});
 assert.notEqual(next,previous);
});

test('429 produces a timed notice while other failures use a neutral retry notice',()=>{
 assert.deepEqual(quoteFailure({status:429,retryAfter:'90'},1000),{
  message:'DEX Screener 暂时限流，保留上次行情',retryAt:91000
 });
 assert.deepEqual(quoteFailure({status:502},1000),{
  message:'行情源暂时不可用，保留上次行情',retryAt:61000
 });
});

test('countdown reaches zero without becoming negative',()=>{
 assert.equal(secondsUntil(61500,1000),61);
 assert.equal(secondsUntil(1000,1000),0);
 assert.equal(secondsUntil(500,1000),0);
});
