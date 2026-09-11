import {CHAINS,normalizeCA} from './domain.mjs';
export function discoveryAddress(raw){return normalizeCA(typeof raw==='string'&&raw.trim().startsWith('0x')?'ethereum':'solana',raw)}
export function candidatesFromPairs(pairs,raw){
 const ca=discoveryAddress(raw),found=new Map();
 const positive=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
 for(const p of Array.isArray(pairs)?pairs:[]){
  if(!CHAINS.includes(p.chainId))continue;
  const same=t=>{try{return normalizeCA(p.chainId,t?.address)===ca}catch{return false}};
  const base=same(p.baseToken),token=base?p.baseToken:same(p.quoteToken)?p.quoteToken:null;if(!token)continue;
  const candidate={chain:p.chainId,ca,name:String(token.name??'').slice(0,120),symbol:String(token.symbol??'').slice(0,40),marketCap:base?positive(p.marketCap):null,liquidity:positive(p.liquidity?.usd)};
  const old=found.get(p.chainId);if(!old||(candidate.liquidity??0)>(old.liquidity??0))found.set(p.chainId,candidate);
 }
 return [...found.values()].sort((a,b)=>(b.liquidity??0)-(a.liquidity??0)||a.chain.localeCompare(b.chain));
}
export async function discoverTokens(raw,fetcher=fetch){
 const ca=discoveryAddress(raw);const r=await fetcher('https://api.dexscreener.com/latest/dex/search?q='+encodeURIComponent(ca),{signal:AbortSignal.timeout(8000)});
 if(!r.ok){const e=new Error(r.status===429?'查询较多，请稍后重试或手动选择网络':'暂时无法匹配，请重试或手动选择网络');e.status=r.status===429?429:502;e.retryAfter=r.headers.get('retry-after')??'60';throw e}
 return candidatesFromPairs((await r.json()).pairs,ca);
}
