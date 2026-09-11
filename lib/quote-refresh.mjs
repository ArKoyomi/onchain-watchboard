export function retryDelayMs(error){
 const seconds=Number(error?.retryAfter);
 return Math.min(3600,Math.max(60,Number.isFinite(seconds)?seconds:60))*1000;
}

export function mergeQuoteBatch(previous,chain,incoming){
 const next={...previous};
 for(const quote of incoming){
  const key=chain+':'+quote.ca;
  next[key]=quote.status==='missing'&&previous[key]
   ? {...previous[key],status:'stale'}
   : quote;
 }
 return next;
}

export function quoteFailure(error,now=Date.now()){
 return {
  message:error?.status===429
   ? 'DEX Screener 暂时限流，保留上次行情'
   : '行情源暂时不可用，保留上次行情',
  retryAt:now+retryDelayMs(error)
 };
}

export function secondsUntil(retryAt,now=Date.now()){
 return Math.max(0,Math.ceil((retryAt-now)/1000));
}
