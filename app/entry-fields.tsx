'use client';
import {useEffect,useRef,useState} from 'react';
import {retrySeconds} from '../lib/history-client.mjs';
import {capInput,localDateTime} from '../lib/entry-fields.mjs';
type Packet={signature:string;data:{amount:string;requestedAt:string;candleStart:string;candleEnd:string;chain:string;ca:string}};
export default function EntryFields({entry,selection,onBusy}:{entry?:{created_at:string;baseline_market_cap:string|null};selection?:{chain:string;ca:string}|null;onBusy:(busy:boolean)=>void}){
 const [timeChanged,setTimeChanged]=useState(false),[time,setTime]=useState(()=>localDateTime(entry?new Date(entry.created_at):new Date())),[cap,setCap]=useState(()=>capInput(entry?.baseline_market_cap).value),[unit,setUnit]=useState(()=>capInput(entry?.baseline_market_cap).unit),[estimate,setEstimate]=useState<Packet|null>(null),[status,setStatus]=useState(''),[retry,setRetry]=useState(0),[applied,setApplied]=useState(false),[capChanged,setCapChanged]=useState(false);
 const [timeEditing,setTimeEditing]=useState(false),[cooldownUntil,setCooldownUntil]=useState(0),[secondsLeft,setSecondsLeft]=useState(0);
 useEffect(()=>{const tick=()=>setSecondsLeft(Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[cooldownUntil]);
 const edited=useRef(false),wasApplied=useRef(false),requestId=useRef(0);
 const chain=selection?.chain,ca=selection?.ca;
 let target='';try{target=new Date(time).toISOString()}catch{/* Browser validates the date. */}
 const validEstimate=estimate&&estimate.data.chain===chain&&estimate.data.ca===ca&&estimate.data.requestedAt===target?estimate:null;
 useEffect(()=>{
  const id=++requestId.current,controller=new AbortController();setEstimate(null);setApplied(false);if(wasApplied.current){setCap('');wasApplied.current=false}onBusy(false);
  if(!timeChanged){setStatus('');return}if(!chain||!ca){setStatus('先选择代币，再查询历史估算');return}if(!target||Date.parse(target)>Date.now()){setStatus('请选择有效的过去时间');return}
  if(timeEditing){setStatus('完成时间输入后将自动查询');return}if(cooldownUntil>Date.now()){setStatus('GeckoTerminal 暂时限流，请等待冷却结束后重试');return}
  setStatus('正在查询历史分钟线…');onBusy(true);
  const timer=setTimeout(async()=>{try{const r=await fetch('/api/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chain,ca,createdAt:target}),signal:controller.signal});const d=await r.json() as {error?:string;estimate:Packet};if(!r.ok){if(r.status===429&&requestId.current===id)setCooldownUntil(Date.now()+retrySeconds(r.headers.get('retry-after'))*1000);throw Error(d.error||'历史查询失败')}if(requestId.current!==id)return;setEstimate(d.estimate);setStatus('');if(!edited.current){const formatted=capInput(d.estimate.data.amount);setCap(formatted.value);setUnit(formatted.unit);setApplied(true);wasApplied.current=true}}catch(e){if(requestId.current===id&&!controller.signal.aborted)setStatus((e as Error).message)}finally{if(requestId.current===id)onBusy(false)}},800);
  return()=>{++requestId.current;clearTimeout(timer);controller.abort();onBusy(false)};
 },[chain,ca,target,timeChanged,timeEditing,retry,onBusy]);
 const manual=()=>{edited.current=true;wasApplied.current=false;setApplied(false);setCapChanged(true)};
 const useEstimate=()=>{if(!validEstimate)return;edited.current=false;wasApplied.current=true;setApplied(true);const formatted=capInput(validEstimate.data.amount);setCap(formatted.value);setUnit(formatted.unit)};
 return <><label className="field">首次市值（可选）<div className="amount-input"><select name="capUnit" aria-label="市值单位" value={unit} onChange={e=>{manual();setUnit(e.target.value)}}><option value="K">K · 千</option><option value="M">M · 百万</option><option value="B">B · 十亿</option><option value="USD">USD · 美元</option></select><input name="cap" aria-label="市值数值" type="text" inputMode="decimal" value={cap} onChange={e=>{manual();setCap(e.target.value)}} placeholder={entry||timeChanged?'留空表示暂无基准':'留空读取添加时行情'}/></div></label>
 <label className="field">收录时间<input name="createdAt" aria-label="收录时间" type="datetime-local" step="1" required value={time} onFocus={()=>setTimeEditing(true)} onBlur={()=>setTimeEditing(false)} onChange={e=>{++requestId.current;setEstimate(null);if(wasApplied.current){setCap('');wasApplied.current=false}setApplied(false);setTimeChanged(true);setTime(e.target.value)}}/></label>
 <input type="hidden" name="timeChanged" value={timeChanged?'yes':'no'}/><input type="hidden" name="capChanged" value={capChanged?'yes':'no'}/><input type="hidden" name="estimate" value={applied&&validEstimate?JSON.stringify(validEstimate):''}/>
 {timeChanged&&<div className="history-note"><p className="hint" role="status">{status}</p>{validEstimate&&<><p className="hint">{applied?'已预填':'可用'}历史估算：${Number(validEstimate.data.amount).toLocaleString('en-US',{maximumFractionDigits:2})}。采用 {new Date(validEstimate.data.candleStart).toLocaleString('zh-CN')} 开始的已结束 1 分钟线收盘价，不是所填秒数的成交价。</p><p className="hint">GeckoTerminal 历史价格 × 按 DEX Screener 当前市值/价格反推的供应量。假设供应量不变，不代表已验证的历史流通市值。</p>{!applied&&<button type="button" className="small ghost" onClick={useEstimate}>使用此估算</button>}</>}<button type="button" className="small ghost" disabled={secondsLeft>0} onClick={()=>setRetry(n=>n+1)}>{secondsLeft>0?secondsLeft+' 秒后可重试':'重新查询历史估算'}</button></div>}
 <p className="hint">{entry?'修改后会重新计算倍数，并同步到公共列表。':timeChanged?'自定义时间下，市值留空会保存为暂无基准。':'时间未修改时，使用提交成功的时刻。'} 时间按当前设备时区显示；手填金额不会被查询结果自动覆盖。</p></>;
}
