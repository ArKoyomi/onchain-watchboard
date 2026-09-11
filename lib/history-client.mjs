export function retrySeconds(value,now=Date.now()){
 const seconds=Number(value);return Math.max(1,Math.ceil(value&&Number.isFinite(seconds)?seconds:value&&Number.isFinite(Date.parse(value))?(Date.parse(value)-now)/1000:60));
}
// Short-lived process memory only: no database quote cache or scheduled polling.
export function createHistoryClient(fetcher=fetch,now=Date.now){
 const cache=new Map(),pending=new Map();let blockedUntil=0;
 const blocked=()=>{const e=new Error('GeckoTerminal 暂时限流，请等待冷却结束后重试');e.status=429;e.retryAfter=String(Math.max(1,Math.ceil((blockedUntil-now())/1000)));return e};
 return async url=>{
  const cached=cache.get(url);if(cached&&cached.until>now())return cached.data;
  if(blockedUntil>now())throw blocked();if(pending.has(url))return pending.get(url);
  const task=(async()=>{const r=await fetcher(url,{signal:AbortSignal.timeout(10000)});
   if(r.status===429){blockedUntil=Math.max(blockedUntil,now()+retrySeconds(r.headers.get('retry-after'),now())*1000);throw blocked()}
   if(!r.ok){const e=new Error(r.status===404?'该网络或代币暂无历史数据':'历史行情源暂不可用，请手动填写');e.status=502;throw e}
   const data=await r.json();for(const [key,item] of cache)if(item.until<=now())cache.delete(key);if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(url,{data,until:now()+60000});return data;
  })();pending.set(url,task);try{return await task}finally{pending.delete(url)}
 };
}
const clients=new WeakMap();
export function historyClient(fetcher){if(!clients.has(fetcher))clients.set(fetcher,createHistoryClient(fetcher));return clients.get(fetcher)}
