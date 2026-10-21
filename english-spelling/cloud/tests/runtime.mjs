import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export async function runtime(){
 const root=fileURLToPath(new URL('../',import.meta.url));mkdirSync(root+'dist',{recursive:true});
 await build({entryPoints:[root+'src/index.js'],bundle:true,format:'esm',outfile:root+'dist/test-worker.mjs'});
 const mf=new Miniflare(convertV4MiniflareOptions({name:"ian-test",modules:true,scriptPath:root+'dist/test-worker.mjs',compatibilityDate:'2026-10-17',d1Databases:{DB:'test-'+crypto.randomUUID()},bindings:{FRONTEND_ORIGIN:'http://localhost:4173',ADMIN_PASSWORD:'test-admin-secret-unique',IAN_PIN:'test-student-pin',SESSION_SECRET:'runtime-test-secret-more-than-thirty-two-characters'}}));
 const db=await mf.getD1Database('DB');
 for(const f of readdirSync(root+'migrations').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync(root+'migrations/'+f,'utf8').split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 return {mf,db};
}
