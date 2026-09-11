import {manualCap} from './domain.mjs';
const powers={USD:0,K:3,M:6,B:9};
export function capInUSD(value,unit='K'){
 if(!Object.hasOwn(powers,unit))throw Error('请选择 USD、K、M 或 B');
 if(value==null||value==='')return '';
 const raw=String(value).trim();
 if(!new RegExp('^\\d{1,24}(\\.\\d{1,'+(12+powers[unit])+'})?$').test(raw)||!Number.isFinite(Number(raw))||Number(raw)<=0)throw Error('请输入大于 0 的有效市值');
 const [integer,fraction='']=raw.split('.');const digits=integer+fraction;const point=integer.length+powers[unit];
 const result=point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point);
 const normalized=result.replace(/^0+(?=\d)/,'');
 return manualCap(normalized.includes('.')?normalized.replace(/0+$/,'').replace(/\.$/,''):normalized);
}
export function capInput(value){
 if(value==null||value==='')return {value:'',unit:'K'};
 const raw=manualCap(value),n=Number(raw),unit=n>=1e9?'B':n>=1e6?'M':'K';
 const [integer,fraction='']=raw.split('.'),power=powers[unit],padded=integer.padStart(power+1,'0');
 return {unit,value:(padded.slice(0,-power)+'.'+padded.slice(-power)+fraction).replace(/0+$/,'').replace(/\.$/,'')};
}
export function capInputK(value){if(value==null)return '';const [i,f='']=String(value).split('.');const padded=i.padStart(4,'0');return (padded.slice(0,-3)+'.'+padded.slice(-3)+f).replace(/0+$/,'').replace(/\.$/,'');}
export function entryTime(value){if(value==null||value==='')return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('请输入有效的收录时间');return new Date(value).toISOString();}
export function localDateTime(value=new Date()){const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19);}
