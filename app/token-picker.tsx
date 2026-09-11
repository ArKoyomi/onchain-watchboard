'use client';
import {useEffect,useState} from 'react';
import {normalizeCA} from '../lib/domain.mjs';
import {discoveryAddress} from '../lib/discovery.mjs';
type Candidate={chain:string;ca:string;name:string;symbol:string;marketCap:number|null;liquidity:number|null};
const chains:Record<string,string>={ethereum:'Ethereum',bsc:'BSC',base:'Base',solana:'Solana',robinhood:'Robinhood'};
const amount=(n:number|null)=>n==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(n);
export default function TokenPicker({tokens,onReady,onSelection}:{onSelection:(selection:{chain:string;ca:string}|null)=>void;tokens:{chain:string;ca:string}[];onReady:(ready:boolean)=>void}){
 const [ca,setCA]=useState(''),[candidates,setCandidates]=useState<Candidate[]>([]),[selected,setSelected]=useState(''),[manual,setManual]=useState(false),[status,setStatus]=useState(''),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(false);
 useEffect(()=>{let alive=true;const controller=new AbortController();let address:string;try{address=discoveryAddress(ca)}catch{setStatus(ca?'请粘贴完整、有效的 CA':'');setLoading(false);return}
  setLoading(true);setStatus('正在匹配币名和网络…');const timer=setTimeout(async()=>{try{const r=await fetch('/api/discover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ca:address}),signal:controller.signal});const d=await r.json() as {error?:string;candidates:Candidate[]};if(!r.ok)throw Error(d.error||'查询失败');if(!alive)return;const list:Candidate[]=d.candidates;setCandidates(list);setStatus(list.length?'请确认下方币名和网络':'未匹配到代币，可手动选择网络继续');if(list.length===1){setSelected(list[0].chain);onReady(true)}}catch(e){if(alive)setStatus((e as Error).message)}finally{if(alive)setLoading(false)}},500);
  return()=>{alive=false;clearTimeout(timer);controller.abort()};
 },[ca,attempt,onReady]);
 useEffect(()=>{try{onSelection(selected?{chain:selected,ca:normalizeCA(selected,ca)}:null)}catch{onSelection(null)}},[ca,selected,onSelection]);
 const reset=()=>{setCandidates([]);setSelected('');setManual(false);onReady(false)};
 return <><label className="field">合约地址 CA<input name="ca" required autoComplete="off" value={ca} placeholder="粘贴完整 CA，自动识别币名和网络" onChange={e=>{reset();setCA(e.target.value)}}/></label><p className="hint ca-status" role="status">{status}</p>
 {!manual&&candidates.length>0&&<div className="candidates" role="radiogroup" aria-label="匹配的代币">{candidates.map(c=><label className={'candidate '+(selected===c.chain?'chosen':'')} key={c.chain}><input type="radio" name="candidate" value={c.chain} checked={selected===c.chain} onChange={()=>{setSelected(c.chain);onReady(true)}}/><div><strong>{c.symbol||'未识别符号'} <span className="chain"><img src={'/chains/'+c.chain+'.png'} alt=""/>{chains[c.chain]}</span></strong><div>{c.name||'暂无币名'}</div><small>市值 {amount(c.marketCap)} · 流动性 {amount(c.liquidity)}{tokens.some(t=>t.chain===c.chain&&t.ca===c.ca)?' · 已收录':''}</small></div></label>)}</div>}
 {!loading&&ca&&<div className="split"><button type="button" className="small ghost" onClick={()=>{reset();setAttempt(n=>n+1)}}>重新匹配</button><button type="button" className="small ghost" onClick={()=>{setManual(true);setSelected('');onReady(false)}}>手动选择网络</button></div>}
 {manual&&<label className="field">网络<select name="chain" required value={selected} onChange={e=>{setSelected(e.target.value);try{normalizeCA(e.target.value,ca);onReady(!!e.target.value)}catch{onReady(false)}}}><option value="">请选择网络</option>{Object.entries(chains).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>}
 {!manual&&<input type="hidden" name="chain" value={selected}/>}
 </>;
}
