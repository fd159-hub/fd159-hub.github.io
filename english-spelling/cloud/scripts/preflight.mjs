import {readFileSync} from 'node:fs';
const mode=process.argv[2];
if(!['staging','production'].includes(mode))throw Error('Specify staging or production');
const root=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const config=mode==='staging'?root.env.staging:root;
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(config.d1_databases[0].database_id))throw Error('D1 UUID 尚未設定；已阻止遠端操作');
if(mode==='staging'&&config.d1_databases[0].database_id===root.d1_databases[0].database_id)throw Error('Staging 不得使用正式 D1');
if(new URL(config.vars.FRONTEND_ORIGIN).protocol!=='https:')throw Error('遠端前端來源必須是 HTTPS');
console.log('Configuration preflight passed for '+mode+'. Verify Cloudflare secrets separately before login testing.');
