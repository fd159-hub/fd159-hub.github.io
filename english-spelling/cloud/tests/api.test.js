import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {normalizeBackup} from '../src/backup.js';
import {database,environment} from './sqlite-d1.js';
const origin='http://localhost:4173';
async function request(env,path,body,token,method=body===undefined?'GET':'POST',extra={}){
  const r=await worker.fetch(new Request('http://api.test'+path,{method,headers:{origin,...(body!==undefined?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
  return {status:r.status,body:r.status===204?null:await r.json(),headers:r.headers};
}
async function login(env,role='student'){const r=await request(env,'/api/login',{role,password:role==='admin'?env.ADMIN_PASSWORD:env.IAN_PIN});assert.equal(r.status,200);return r.body.token}
const answer=(env,t,wordId,mode,answer,requestId=crypto.randomUUID())=>request(env,'/api/attempt',{wordId,mode,answer,requestId},t);
const fixture=()=>({version:3,lessons:[{title:'自訂第一課',words:[{en:'one',zh:'一'},{variants:[{en:'Miss',zh:'小姐'},{en:'miss',zh:'想念'}]}]}],history:{'0|listen|one':{good:2,bad:3}},misses:{'0|miss':true},stageUnlock:{0:1},attempts:{'0|listen':9}});
test('schema, seed counts, case-sensitive variants and additive migration',()=>{
 const db=database();assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,2);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM lessons').get().n,3);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM words').get().n,25);
 assert.equal(db.sqlite.prepare('SELECT COUNT(DISTINCT lesson_id||\'|\'||group_no) n FROM words').get().n,24);
 assert.equal(db.sqlite.prepare("SELECT image FROM words WHERE spelling='cap'").get().image,'🧢');
 db.sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM words').get().n,25);
 assert.throws(()=>db.sqlite.exec("INSERT INTO words(lesson_id,group_no,spelling,meaning) VALUES(99,1,'x','x')"));
 db.sqlite.close();
});

test('independent stage overrides enforce roles, survive reset, and round-trip backups',async()=>{
 const env=environment(),admin=await login(env,'admin'),student=await login(env);
 const set=(body,token=admin,method='POST')=>request(env,'/api/admin/stage-access',body,token,method);
 assert.equal((await set({lessonId:1,mode:'dictation',allowed:true},student)).status,403);
 assert.equal((await set({lessonId:999,mode:'listen',allowed:true})).status,404);
 for(const body of [{lessonId:1,mode:'invalid',allowed:true},{lessonId:1,mode:'tiles',allowed:1},{lessonId:'1',mode:'tiles',allowed:true}])assert.equal((await set(body)).status,400);
 assert.equal((await set({lessonId:1,mode:'dictation',allowed:true})).status,200);
 assert.equal((await answer(env,student,1,'dictation','one')).status,200);
 assert.equal((await answer(env,student,1,'tiles','one')).status,403);
 assert.equal((await answer(env,student,9,'dictation','two')).status,403);
 await set({lessonId:1,mode:'listen',allowed:false});
 const attempts=env.DB.sqlite.prepare('SELECT COUNT(*) n FROM attempts').get().n;
 assert.equal((await answer(env,student,1,'listen','one')).status,403);
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM attempts').get().n,attempts);
 env.DB.sqlite.exec("INSERT INTO unlocks(user_id,lesson_id,stage) VALUES('ian',1,5)");
 assert.equal((await answer(env,student,1,'listen','one')).status,403);
 const backup=(await request(env,'/api/admin/export',undefined,admin)).body;
 assert.equal(backup.stageAccess['0|listen'],false);assert.equal(backup.stageAccess['0|dictation'],true);
 const fresh=environment(),freshAdmin=await login(fresh,'admin');
 assert.equal((await request(fresh,'/api/admin/import',{confirm:'IMPORT_BACKUP',backup},freshAdmin)).status,200);
 assert.deepEqual((await request(fresh,'/api/admin/export',undefined,freshAdmin)).body.stageAccess,backup.stageAccess);
 const invalid=fixture();invalid.stageAccess={'0|listen':'false'};assert.throws(()=>normalizeBackup(invalid));
 await request(env,'/api/admin/reset',{lessonId:1},admin);
 assert.equal((await answer(env,student,1,'dictation','one')).status,200);
 assert.equal((await answer(env,student,1,'listen','one')).status,403);
 await set({lessonId:2,mode:'review',allowed:true});
 await set({lessonId:1},admin,'DELETE');
 assert.equal((await answer(env,student,1,'dictation','one')).status,403);
 assert.equal((await answer(env,student,1,'listen','one')).status,200);
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM stage_access WHERE lesson_id=2').get().n,1);
});
test('health queries schema; missing configuration fails closed',async()=>{
 const env=environment();assert.equal((await request(env,'/api/health')).status,200);
 assert.equal((await request({...env,DB:null},'/api/health')).status,503);
 assert.equal((await request({...env,SESSION_SECRET:'short'},'/api/health')).status,503);
 const bare=database(':memory:',false);assert.equal((await request(environment(bare),'/api/health')).status,500);
});
test('authentication, malformed/forged/expired tokens, roles and CORS',async()=>{
 const env=environment(),student=await login(env),admin=await login(env,'admin');
 assert.equal((await request(env,'/api/state')).status,401);
 for(const token of ['!!..','abc.%%%','x.y.z',student.slice(0,-4)+'AAAA'])assert.equal((await request(env,'/api/state',undefined,token)).status,401);
 const old=Date.now;Date.now=()=>old()+50000000;try{assert.equal((await request(env,'/api/state',undefined,student)).status,401)}finally{Date.now=old}
 assert.equal((await request(env,'/api/admin/reset',{lessonId:1},student)).status,403);
 assert.equal((await answer(env,admin,1,'listen','one')).status,403);
 assert.equal((await request(env,'/api/state',undefined,student)).body.words.length,25);
 assert.equal((await request(env,'/api/state',undefined,student,'GET',{origin:'https://other.test'})).status,403);
 assert.equal((await request(env,'/api/state',undefined,undefined,'OPTIONS')).status,204);
 assert.equal((await request(env,'/api/state',undefined,undefined,'OPTIONS',{origin:'https://other.test'})).status,403);
 const invalid=await worker.fetch(new Request('http://api.test/api/login',{method:'POST',headers:{'content-type':'application/json',origin},body:'{'}),env);assert.equal(invalid.status,400);
 assert.equal((await request(env,'/api/login',{role:'bogus',password:'x'})).status,400);
});
test('login throttle counts rejected requests without bypass',async()=>{
 const env=environment();for(let n=0;n<10;n++)assert.equal((await request(env,'/api/login',{role:'student',password:'wrong'})).status,401);
 assert.equal((await request(env,'/api/login',{role:'student',password:env.IAN_PIN})).status,429);
 env.DB.sqlite.exec('UPDATE login_limits SET reset_at=0');assert.ok(await login(env));
});
test('streak resets, request replay is idempotent, locked stages denied',async()=>{
 const env=environment(),t=await login(env);
 assert.equal((await answer(env,t,1,'dictation','one')).status,403);
 const id=crypto.randomUUID();await answer(env,t,1,'listen','one',id);await answer(env,t,1,'listen','one',id);
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM attempts').get().n,1);
 assert.equal((await answer(env,t,1,'listen','wrong',id)).status,409);
 await answer(env,t,1,'listen','wrong');let p=env.DB.sqlite.prepare('SELECT * FROM progress').get();assert.equal(p.streak,0);assert.equal(p.correct,1);assert.equal(p.wrong,1);assert.equal(p.missed,1);
 await answer(env,t,1,'listen','one');await answer(env,t,1,'listen','one');p=env.DB.sqlite.prepare('SELECT * FROM progress').get();assert.equal(p.streak,2);
 assert.equal((await answer(env,t,1,'listen','One')).body.correct,false);
});
test('all stages, third-lesson images and empty picture skip',async()=>{
 const env=environment(),t=await login(env);const words=env.DB.sqlite.prepare('SELECT * FROM words WHERE lesson_id=3').all();
 for(const mode of ['listen','tiles','missing','picture','dictation']){
  for(const w of words.filter(w=>mode!=='picture'||w.image))for(let i=0;i<2;i++)assert.equal((await answer(env,t,w.id,mode,w.spelling)).status,200);
 }
 assert.equal(env.DB.sqlite.prepare('SELECT stage FROM unlocks WHERE lesson_id=3').get().stage,5);
 await answer(env,t,words[0].id,'review','wrong');await answer(env,t,words[0].id,'review',words[0].spelling);
 assert.equal(env.DB.sqlite.prepare('SELECT MAX(missed) n FROM progress WHERE word_id=?').get(words[0].id).n,0);
 const env2=environment(),t2=await login(env2);env2.DB.sqlite.exec('UPDATE words SET image=NULL WHERE lesson_id=3');
 for(const mode of ['listen','tiles','missing'])for(const w of words)for(let i=0;i<2;i++)await answer(env2,t2,w.id,mode,w.spelling);
 assert.equal(env2.DB.sqlite.prepare('SELECT stage FROM unlocks WHERE lesson_id=3').get().stage,4);
});
test('admin CRUD, invalid inputs, cleanup and isolated lesson reset',async()=>{
 const env=environment(),s=await login(env),a=await login(env,'admin');
 const original=env.DB.sqlite.prepare('SELECT COUNT(*) n FROM words').get().n;
 await answer(env,s,1,'listen','one');const second=env.DB.sqlite.prepare('SELECT * FROM words WHERE lesson_id=2 LIMIT 1').get();await answer(env,s,second.id,'listen',second.spelling);
 assert.equal((await request(env,'/api/admin/reset',{lessonId:1},a)).status,200);assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM progress').get().n,1);assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM words').get().n,original);
 assert.equal((await request(env,'/api/admin/reset',{lessonId:99},a)).status,404);
 assert.equal((await request(env,'/api/admin/lessons',{title:'新課'},a)).status,200);
 const word={lessonId:4,groupNo:1,spelling:'apple',meaning:'蘋果',image:'🍎'};
 assert.equal((await request(env,'/api/admin/words',word,a)).status,200);assert.equal((await request(env,'/api/admin/words',word,a)).status,409);
 const w=env.DB.sqlite.prepare("SELECT * FROM words WHERE spelling='apple'").get();
 assert.equal((await request(env,'/api/admin/words',{...word,id:w.id,meaning:'新詞義'},a)).status,200);
 assert.equal((await request(env,'/api/admin/words',{...word,id:999},a)).status,404);
 assert.equal((await request(env,'/api/admin/words',{...word,lessonId:999},a)).status,404);
 assert.equal((await request(env,'/api/admin/words',{...word,spelling:'<bad>'},a)).status,400);
 await answer(env,s,w.id,'listen','apple');assert.equal((await request(env,'/api/admin/words',{id:w.id},a,'DELETE')).status,200);
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM attempts WHERE word_id=?').get(w.id).n,0);assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM progress WHERE word_id=?').get(w.id).n,0);
});
test('backup validation and atomic import preserve mapping, Miss/miss, streak and misses',async()=>{
 const env=environment(),a=await login(env,'admin'),backup=fixture();
 assert.equal((await request(env,'/api/admin/import',{backup,confirm:'IMPORT_BACKUP'},a)).status,200);
 const out=(await request(env,'/api/admin/export',undefined,a)).body;
 assert.equal(out.lessons[0].title,'自訂第一課');assert.equal(out.lessons[0].words[1].variants[0].en,'Miss');assert.equal(out.lessons[0].words[1].variants[1].en,'miss');
 assert.deepEqual(out.history['0|listen|one'],{good:2,bad:3});assert.equal(out.misses['0|miss'],true);assert.equal(out.stageUnlock[0],1);
 assert.equal((await request(env,'/api/admin/import',{backup,confirm:'IMPORT_BACKUP'},a)).status,409);
 assert.equal(normalizeBackup(out).words.length,3);
 const invalid=fixture();invalid.history['0|listen|unknown']={good:1,bad:0};assert.throws(()=>normalizeBackup(invalid));
 const clean=environment(),a2=await login(clean,'admin');assert.equal((await request(clean,'/api/admin/import',{backup:invalid,confirm:'IMPORT_BACKUP'},a2)).status,400);assert.equal(clean.DB.sqlite.prepare('SELECT COUNT(*) n FROM words').get().n,25);
});
test('database batch rollback leaves no partial writes',async()=>{
 const db=database();await assert.rejects(db.batch([db.prepare("INSERT INTO lessons(id,title,position) VALUES(10,'x',10)"),db.prepare("INSERT INTO lessons(id,title,position) VALUES(11,'x',10)")]));assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM lessons').get().n,3);
});
