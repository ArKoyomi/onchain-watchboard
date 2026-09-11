const CHAIN_SLUGS={ethereum:'eth',bsc:'bsc',base:'base',solana:'sol',robinhood:'robinhood'};

export function gmgnTokenUrl(chain,ca){
 const slug=CHAIN_SLUGS[chain];
 return slug?`https://gmgn.ai/${slug}/token/${encodeURIComponent(ca)}`:null;
}

export function placeCaMenu(rect,viewport){
 const width=184,height=110,padding=12,gap=6;
 return {
  left:Math.max(padding,Math.min(rect.left,viewport.width-width-padding)),
  top:rect.bottom+height+padding<=viewport.height?rect.bottom+gap:Math.max(padding,rect.top-height-gap)
 };
}
