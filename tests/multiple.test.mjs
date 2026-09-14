import test from 'node:test';
import assert from 'node:assert/strict';
import {priceMultiple} from '../lib/multiple.mjs';

test('personal entry price takes priority over the public first price',()=>{
 assert.deepEqual(priceMultiple(8,1,2),{value:4,baseline:2,source:'personal'});
});

test('public first price is used when there is no personal entry price',()=>{
 assert.deepEqual(priceMultiple(8,1,null),{value:8,baseline:1,source:'public'});
});

test('missing or invalid prices do not produce a misleading multiple',()=>{
 assert.equal(priceMultiple(null,1,2),null);
 assert.equal(priceMultiple(8,null,null),null);
 assert.deepEqual(priceMultiple(8,1,0),{value:8,baseline:1,source:'public'});
});
