import {historyClient} from './history-client.mjs';
import {normalizeCA,fetchQuotes,manualCap} from './domain.mjs';
import {entryTime} from './entry-fields.mjs';
const networks={ethereum:'eth',bsc:'bsc',base:'base',solana:'solana',robinhood:'robinhood'};
export function previousCandle(rows,targetMs){
 return (Array.isArray(rows)?rows:[]).filter(r=>Array.isArray(r)&&r.length>=6&&Number.isFinite(r[0])&&r[0]%60===0&&(r[0]+60)*1000<=targetMs&&targetMs-(r[0]+60)*1000<=120000&&Number.isFinite(Number(r[4]))&&Number(r[4])>0&&Number(r[5])>0).sort((a,b)=>b[0]-a[0])[0]??null;
}
export async function historicalEstimate(chain,raw,time,fetcher=fetch,now=Date.now()){
 const ca=normalizeCA(chain,raw),requestedAt=entryTime(time),target=Date.parse(requestedAt??'');
 if(!Number.isFinite(target)||target>now)throw Error('请选择有效的过去时间');
 const root='https://api.geckoterminal.com/api/v2/networks/'+networks[chain];
 const client=historyClient(fetcher);const get=path=>client(root+path);
 const data=await get('/tokens/'+ca+'?include=top_pools');
 const pool=(data.included??[]).filter(p=>p.type==='pool'&&Number(p.attributes?.reserve_in_usd)>0&&Date.parse(p.attributes?.pool_created_at)<=target&&['base_token','quote_token'].some(side=>p.relationships?.[side]?.data?.id===networks[chain]+'_'+ca)).sort((a,b)=>Number(b.attributes.reserve_in_usd)-Number(a.attributes.reserve_in_usd))[0];
 if(!pool)throw Error('未找到在所选时间已建立的可用交易池，请手动填写');
 const poolAddress=normalizeCA(chain,pool.attributes.address);
 const before=Math.floor(target/60000)*60;
 const candles=await get('/pools/'+poolAddress+'/ohlcv/minute?aggregate=1&before_timestamp='+before+'&limit=5&currency=usd&token='+encodeURIComponent(ca)+'&include_empty_intervals=false');
 const candle=previousCandle(candles.data?.attributes?.ohlcv_list,target);
 if(!candle)throw Error('所选时间附近没有已结束且有成交的分钟线，请手动填写');
 const q=(await fetchQuotes(chain,[ca],fetcher))[0];
 if(!(q?.marketCap>0&&q?.price>0))throw Error('缺少当前市值或价格，无法估算供应量；不会使用 FDV 替代，请手动填写');
 const historicalPrice=Number(candle[4]),supply=q.marketCap/q.price,value=historicalPrice*supply;
 if(!Number.isFinite(value)||value<=0||value>=1e24)throw Error('估算结果无效，请手动填写');
 const amount=manualCap(value.toFixed(8));
 return {provider:'geckoterminal',method:'current-market-cap-ratio',chain,ca,requestedAt,candleStart:new Date(candle[0]*1000).toISOString(),candleEnd:new Date((candle[0]+60)*1000).toISOString(),historicalPrice,amount,inferredSupply:supply,referenceMarketCap:q.marketCap,referencePrice:q.price,referenceProvider:'dexscreener',referencePair:q.pair,referenceAt:q.fetchedAt,pool:poolAddress,granularity:'1m'};
}
