import test from 'node:test';
import assert from 'node:assert/strict';
import {gmgnTokenUrl,placeCaMenu} from '../lib/gmgn.mjs';

test('GMGN token links use the chain slug expected by every supported network',()=>{
 const ca='0x'+'a'.repeat(40);
 assert.equal(gmgnTokenUrl('ethereum',ca),`https://gmgn.ai/eth/token/${ca}`);
 assert.equal(gmgnTokenUrl('bsc',ca),`https://gmgn.ai/bsc/token/${ca}`);
 assert.equal(gmgnTokenUrl('base',ca),`https://gmgn.ai/base/token/${ca}`);
 assert.equal(gmgnTokenUrl('solana','So11111111111111111111111111111111111111112'),'https://gmgn.ai/sol/token/So11111111111111111111111111111111111111112');
 assert.equal(gmgnTokenUrl('robinhood',ca),`https://gmgn.ai/robinhood/token/${ca}`);
});

test('GMGN token links encode the address and reject unknown networks',()=>{
 assert.equal(gmgnTokenUrl('base','a/b c'),'https://gmgn.ai/base/token/a%2Fb%20c');
 assert.equal(gmgnTokenUrl('unknown','0xabc'),null);
});

test('CA menu stays inside the viewport and flips above a low trigger',()=>{
 assert.deepEqual(placeCaMenu({left:500,top:600,bottom:620},{width:610,height:683}),{left:414,top:484});
 assert.deepEqual(placeCaMenu({left:30,top:100,bottom:120},{width:610,height:683}),{left:30,top:126});
});
