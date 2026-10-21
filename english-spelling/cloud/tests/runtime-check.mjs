import assert from 'node:assert/strict';
import {runtime} from './runtime.mjs';
const {mf,db}=await runtime();let n=0;
async function call(path,body,token,method=body===undefined?'GET':'POST'){
 const r=await mf.dispatchFetch('http://localhost'+path,{method,headers:{Origin:'http://localhost:4173',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};
}
try{
 assert.equal((await call('/api/health')).status,200);n++;
 const admin=(await call('/api/login',{role:'admin',password:'test-admin-secret-unique'})).data.token;
 const student=(await call('/api/login',{role:'student',password:'test-student-pin'})).data.token;
 assert.ok(admin&&student);assert.equal((await call('/api/state')).status,401);n++;
 const initial=(await call('/api/state',undefined,student)).data;assert.equal(initial.words.length,25);n++;
 const word=initial.words[0],body={wordId:word.id,mode:'listen',answer:word.spelling,requestId:crypto.randomUUID()};
 assert.equal((await call('/api/attempt',body,student)).data.correct,true);await call('/api/attempt',body,student);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM attempts').first()).n,1);n++;
 for(const mode of ['listen','tiles','missing','picture','dictation'])for(const w of initial.words.filter(w=>w.lesson_id===3&&(mode!=='picture'||w.image)))for(let i=0;i<2;i++)assert.equal((await call('/api/attempt',{wordId:w.id,mode,answer:w.spelling,requestId:crypto.randomUUID()},student)).status,200);
 assert.equal((await db.prepare('SELECT stage FROM unlocks WHERE lesson_id=3').first()).stage,5);n++;
 assert.equal((await call('/api/admin/reset',{lessonId:1},student)).status,403);await call('/api/admin/reset',{lessonId:1},admin);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM progress WHERE word_id=?').bind(word.id).first()).n,0);assert.ok((await db.prepare('SELECT COUNT(*) n FROM progress').first()).n>0);n++;
 const backup={version:3,lessons:[{title:'匯入課',words:[{en:'apple',zh:'蘋果'}]}],history:{'0|listen|apple':{good:2,bad:1}},misses:{'0|apple':true},stageUnlock:{0:1},attempts:{'0|listen':4}};
 assert.equal((await call('/api/admin/import',{backup,confirm:'IMPORT_BACKUP'},admin)).status,409);n++;
 await db.batch([db.prepare('DELETE FROM progress'),db.prepare('DELETE FROM attempts')]);
 assert.equal((await call('/api/admin/import',{backup,confirm:'IMPORT_BACKUP'},admin)).status,200);
 const out=(await call('/api/admin/export',undefined,admin)).data;assert.equal(out.lessons[0].words[0].en,'apple');assert.equal(out.history['0|listen|apple'].good,2);assert.equal(out.misses['0|apple'],true);n++;
 console.log('PASS: '+n+' workerd / Miniflare / D1 integration groups');
}finally{await mf.dispose()}
