const positive=value=>value!=null&&Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;

export function priceMultiple(currentPrice,publicFirstPrice,personalEntryPrice){
 const current=positive(currentPrice),personal=positive(personalEntryPrice),first=positive(publicFirstPrice);
 if(current==null)return null;
 const baseline=personal??first;
 if(baseline==null)return null;
 return {value:current/baseline,baseline,source:personal!=null?'personal':'public'};
}
