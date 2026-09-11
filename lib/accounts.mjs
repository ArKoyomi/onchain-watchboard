export function accountEmail(value){
 if(typeof value!=='string')throw new Error('请输入账号');
 const account=value.trim().toLowerCase();
 if(/^[a-z0-9][a-z0-9_-]{2,31}$/.test(account))return account+'@watchboard.invalid';
 if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)&&account.length<=254)return account;
 throw new Error('账号需为 3–32 位字母、数字、下划线或短横线');
}
export function displayAccount(email){return email?.endsWith('@watchboard.invalid')?email.slice(0,-'@watchboard.invalid'.length):email;}
