import {readFile,writeFile,mkdir} from 'node:fs/promises';import {randomBytes} from 'node:crypto';import {accountEmail} from '../lib/accounts.mjs';
const account=process.argv[2],role=process.argv[3]??'member';if(!account||account.includes('@')||!['member','admin'].includes(role))throw Error('Usage: node scripts/create-account.mjs USERNAME member|admin');
const email=accountEmail(account);const name=email.split('@')[0];
const cfg=Object.fromEntries((await readFile('.dev.vars','utf8')).split(/\r?\n/).filter(x=>x&&!x.startsWith('#')&&x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),x.slice(i+1).trim()]}));
const secret=cfg.SUPABASE_SECRET_KEY||cfg.SUPABASE_SERVICE_ROLE_KEY;
const request=async(path,method='GET',body)=>{const r=await fetch(cfg.SUPABASE_URL+path,{method,headers:{apikey:secret,...(!secret.startsWith('sb_secret_')?{Authorization:'Bearer '+secret}:{}),'Content-Type':'application/json',Prefer:'return=minimal'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const d=await r.text();if(!r.ok)throw Error('Supabase request failed: HTTP '+r.status+' '+(JSON.parse(d).code??JSON.parse(d).error_code??''));return d?JSON.parse(d):null};
const users=await request('/auth/v1/admin/users?page=1&per_page=1000');
const resume=process.argv.includes('--resume');
const existing=users.users.find(u=>u.email===email);
if(existing&&!resume)throw Error('Account already exists; nothing changed.');
let password;
if(resume){const saved=await readFile('.local-accounts/'+name+'.txt','utf8');password=saved.match(/^初始密码：(.*)$/m)?.[1]?.trim();if(!password)throw Error('Saved initial password is unavailable');}
else password=randomBytes(18).toString('base64url')+'a9!';
await mkdir('.local-accounts',{recursive:true});
// Save before the external mutation so a timeout cannot lose the initial password.
if(!resume)await writeFile('.local-accounts/'+name+'.txt','看板账号：'+name+'\n初始密码：'+password+'\n角色：'+role+'\n地址：http://localhost:5173/\n登录后可点击「改密」。请勿转发管理员账号。\n',{flag:'wx'});
const user=existing??await request('/auth/v1/admin/users','POST',{email,password,email_confirm:true,user_metadata:{username:name}});
const previous=await request('/rest/v1/members?select=role,enabled&user_id=eq.'+user.id);
if(!previous.length)await request('/rest/v1/members','POST',{user_id:user.id,role,enabled:true});
const member=await request('/rest/v1/members?select=role,enabled&user_id=eq.'+user.id);
console.log(JSON.stringify({account:name,created:true,member:member[0],credentialsFile:'.local-accounts/'+name+'.txt'}));
