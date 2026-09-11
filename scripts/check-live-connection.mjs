import {readFile} from 'node:fs/promises';
const origin='http://localhost:5173';
const saved=await readFile('.local-accounts/admin.txt','utf8');
const password=saved.match(/^初始密码：(.*)$/m)?.[1]?.trim();
if(!password)throw Error('Missing saved initial password');
let cookie='';
const call=async(path,body)=>{const r=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{origin,'Content-Type':'application/json',...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});const set=r.headers.getSetCookie();if(set.length)cookie=set.map(s=>s.split(';')[0]).join('; ');const d=await r.json();if(!r.ok)throw Error(path+': HTTP '+r.status+' '+(d.error??''));return d;};
try{
 const config=await call('config');if(!config.configured)throw Error('App is not configured');
 const board=await call('board');console.log(JSON.stringify({check:'public_board',version:board.version,records:board.tokens.length}));
 await call('login',{email:'admin',password});const me=await call('me');if(me.user?.role!=='admin'||me.user?.email!=='admin')throw Error('Admin session mismatch');console.log(JSON.stringify({check:'admin_login',ok:true,favorites:me.favorites.length}));
 const refresh=await call('session',{});if(!refresh.ok)throw Error('Session refresh failed');const again=await call('me');if(again.user?.role!=='admin')throw Error('Refreshed session invalid');console.log(JSON.stringify({check:'session_refresh',ok:true}));
 await call('logout',{});const anon=await call('me');if(anon.user!==null)throw Error('Logout failed');console.log(JSON.stringify({check:'logout',ok:true}));
 const blocked=await fetch(origin+'/api/tokens',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({chain:'base',ca:'0x4200000000000000000000000000000000000006'})});if(blocked.status!==401)throw Error('Anonymous write not rejected');console.log(JSON.stringify({check:'anonymous_write',status:blocked.status}));
}finally{if(cookie)await call('logout',{}).catch(()=>{});}
