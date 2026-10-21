import {MODES, normalizeBackup, legacyState, normalizeSpelling} from './backup.js';
import packageInfo from '../package.json' with {type:'json'};
const enc=new TextEncoder();
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
class ApiError extends Error { constructor(message,status=400){super(message);this.status=status} }
const requireValue=(yes,message,status=400)=>{if(!yes)throw new ApiError(message,status)};
const integer=(n,min=1)=>Number.isSafeInteger(n)&&n>=min;
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
const unb64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const secureEq=(a,b)=>{const x=enc.encode(a),y=enc.encode(b);let d=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)d|=(x[i]||0)^(y[i]||0);return d===0};
async function hmac(key,usage){return crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,[usage])}
async function sign(payload,key){const body=b64(enc.encode(JSON.stringify(payload)));return body+'.'+b64(await crypto.subtle.sign('HMAC',await hmac(key,'sign'),enc.encode(body)))}
async function session(req,env){
  try{
    const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');
    if(token.length>2000)return null;
    const [body,sig,...extra]=token.split('.');if(!body||!sig||extra.length)return null;
    if(!await crypto.subtle.verify('HMAC',await hmac(env.SESSION_SECRET,'verify'),unb64(sig),enc.encode(body)))return null;
    const u=JSON.parse(new TextDecoder().decode(unb64(body)));
    return u.exp>Date.now()/1000&&u.aud===env.FRONTEND_ORIGIN&&((u.sub==='ian'&&u.role==='student')||(u.sub==='admin'&&u.role==='admin'))?u:null;
  }catch{return null}
}
async function bodyJson(req){
  requireValue((req.headers.get('content-type')||'').split(';')[0].trim()==='application/json','需要 application/json',415);
  const text=await req.text();requireValue(enc.encode(text).length<=1000000,'資料過大',413);
  let b;try{b=JSON.parse(text)}catch{throw new ApiError('JSON 格式無效')}
  requireValue(b&&typeof b==='object'&&!Array.isArray(b),'JSON 必須是物件');return b;
}
async function state(env){
  const results=await env.DB.batch([
    env.DB.prepare('SELECT * FROM lessons ORDER BY position'),env.DB.prepare('SELECT * FROM words ORDER BY lesson_id,group_no,id'),
    env.DB.prepare('SELECT * FROM progress WHERE user_id=?').bind('ian'),env.DB.prepare('SELECT * FROM unlocks WHERE user_id=?').bind('ian'),
    env.DB.prepare('SELECT * FROM stage_access WHERE user_id=?').bind('ian')
  ]);
  return {lessons:results[0].results,words:results[1].results,progress:results[2].results,unlocks:results[3].results,stageAccess:results[4].results,user:'ian'};
}
async function updateUnlock(env,lesson){
  let stage=(await env.DB.prepare('SELECT stage FROM unlocks WHERE user_id=? AND lesson_id=?').bind('ian',lesson).first())?.stage||0;
  const start=stage;
  while(stage<5){
    const mode=MODES[stage];
    const total=mode==='listen'?await env.DB.prepare("SELECT COUNT(*) n FROM (SELECT group_no,lower(spelling) FROM words WHERE lesson_id=? GROUP BY group_no,lower(spelling))").bind(lesson).first():await env.DB.prepare("SELECT COUNT(*) n FROM words WHERE lesson_id=? AND (? != 'picture' OR (image IS NOT NULL AND image!=''))").bind(lesson,mode).first();
    // Empty picture stages are skipped; a completely empty lesson is not mastered.
    if(!total.n){if(mode==='picture'){stage++;continue}break}
    const done=mode==='listen'?await env.DB.prepare("SELECT COUNT(*) n FROM (SELECT w.group_no,lower(w.spelling) FROM words w LEFT JOIN progress p ON p.word_id=w.id AND p.user_id='ian' AND p.mode='listen' WHERE w.lesson_id=? GROUP BY w.group_no,lower(w.spelling) HAVING MAX(COALESCE(p.streak,0))>=2)").bind(lesson).first():await env.DB.prepare("SELECT COUNT(*) n FROM words w JOIN progress p ON p.word_id=w.id AND p.user_id='ian' AND p.mode=? WHERE w.lesson_id=? AND p.streak>=2 AND (? != 'picture' OR (w.image IS NOT NULL AND w.image!=''))").bind(mode,lesson,mode).first();
    if(done.n!==total.n)break;stage++;
  }
  if(stage>start)await env.DB.prepare("INSERT INTO unlocks(user_id,lesson_id,stage) VALUES('ian',?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET stage=MAX(stage,excluded.stage)").bind(lesson,stage).run();
  return stage;
}
async function login(req,env){
  const b=await bodyJson(req);requireValue(['student','admin'].includes(b.role),'身分無效');
  const secret=b.role==='admin'?env.ADMIN_PASSWORD:env.IAN_PIN;
  requireValue(secret,'伺服器尚未完成登入設定',503);
  const now=Math.floor(Date.now()/1000),ip=req.headers.get('cf-connecting-ip')||'local';
  // Count before comparing credentials, so concurrent failed logins cannot bypass the limit.
  const result=await env.DB.prepare('INSERT INTO login_limits(ip,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(ip) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING attempts').bind(ip,now+900,now,now).first();
  requireValue(result.attempts<=10,'登入嘗試過多，請 15 分鐘後再試',429);
  requireValue(typeof b.password==='string'&&b.password.length<=200&&secureEq(b.password,secret),'帳號或密碼錯誤',401);
  await env.DB.prepare('DELETE FROM login_limits WHERE ip=? OR reset_at<=?').bind(ip,now).run();
  return json({token:await sign({sub:b.role==='admin'?'admin':'ian',role:b.role,aud:env.FRONTEND_ORIGIN,exp:now+43200},env.SESSION_SECRET),role:b.role,expiresIn:43200});
}
async function attempt(req,env){
  const b=await bodyJson(req);
  requireValue(integer(b.wordId)&&MODES.includes(b.mode)&&typeof b.answer==='string'&&b.answer.length<=100,'作答格式錯誤');
  b.answer=normalizeSpelling(b.answer);
  requireValue(typeof b.requestId==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(b.requestId),'需要有效 requestId');
  const w=await env.DB.prepare('SELECT * FROM words WHERE id=?').bind(b.wordId).first();requireValue(w,'無此單字',404);
  const stage=await updateUnlock(env,w.lesson_id);
  const access=await env.DB.prepare("SELECT allowed FROM stage_access WHERE user_id='ian' AND lesson_id=? AND mode=?").bind(w.lesson_id,b.mode).first();
  requireValue(access?access.allowed===1:MODES.indexOf(b.mode)<=stage,'尚未解鎖此關卡',403);
  requireValue(b.mode!=='picture'||w.image,'此字不適合圖片模式');
  // Only same-group case variants share the listening question. Spelling modes stay exact.
  const listeningGroup=b.mode==='listen'?(await env.DB.prepare('SELECT * FROM words WHERE lesson_id=? AND group_no=?').bind(w.lesson_id,w.group_no).all()).results.filter(v=>v.spelling.toLowerCase()===w.spelling.toLowerCase()):[w];
  const correct=listeningGroup.some(v=>b.answer===v.spelling),fingerprint=JSON.stringify([b.wordId,b.mode,b.answer]);
  const previous=await env.DB.prepare("SELECT fingerprint FROM requests WHERE user_id='ian' AND request_id=?").bind(b.requestId).first();
  if(previous)requireValue(previous.fingerprint===fingerprint,'requestId 已被其他作答使用',409);
  else{
    try{
      const statements=[
        env.DB.prepare("INSERT INTO requests(user_id,request_id,fingerprint) VALUES('ian',?,?)").bind(b.requestId,fingerprint),
        env.DB.prepare("INSERT INTO attempts(user_id,word_id,mode,correct) VALUES('ian',?,?,?)").bind(w.id,b.mode,Number(correct)),
        ...listeningGroup.map(v=>env.DB.prepare("INSERT INTO progress(user_id,word_id,mode,correct,wrong,streak,missed) VALUES('ian',?,?,?,?,?,?) ON CONFLICT(user_id,word_id,mode) DO UPDATE SET correct=correct+excluded.correct,wrong=wrong+excluded.wrong,streak=CASE WHEN excluded.correct=1 THEN streak+1 ELSE 0 END,missed=MAX(missed,excluded.missed)").bind(v.id,b.mode,Number(correct),Number(!correct),Number(correct),Number(!correct)))
      ];
      if(correct&&b.mode==='review')statements.push(env.DB.prepare("UPDATE progress SET missed=0 WHERE user_id='ian' AND word_id=?").bind(w.id));
      await env.DB.batch(statements);
    }catch(e){
      const retry=await env.DB.prepare("SELECT fingerprint FROM requests WHERE user_id='ian' AND request_id=?").bind(b.requestId).first();
      if(!retry)throw e;requireValue(retry.fingerprint===fingerprint,'requestId 已被其他作答使用',409);
    }
  }
  const newStage=await updateUnlock(env,w.lesson_id);
  return json({correct,...(!correct?{spelling:w.spelling}:{}),stage:newStage,unlocked:newStage>stage});
}
async function importBackup(req,env){
  const b=await bodyJson(req);requireValue(b.confirm==='IMPORT_BACKUP','需要明確確認匯入');
  let data;try{data=normalizeBackup(b.backup)}catch(e){throw new ApiError(e.message)}
  const current=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM progress)+(SELECT COUNT(*) FROM attempts)+(SELECT COUNT(*) FROM imports) n').first();
  requireValue(current.n===0,'雲端已有進度或已匯入；不允許覆蓋',409);
  const q=[env.DB.prepare('INSERT INTO imports(id) SELECT CASE WHEN (SELECT COUNT(*) FROM progress)+(SELECT COUNT(*) FROM attempts)=0 THEN 1 ELSE 0 END'),env.DB.prepare('DELETE FROM words'),env.DB.prepare('DELETE FROM lessons'),env.DB.prepare('DELETE FROM unlocks'),env.DB.prepare('DELETE FROM requests')];
  const bulk=(table,columns,rows)=>{
    const size=Math.floor(90/columns.length);
    for(let i=0;i<rows.length;i+=size){const chunk=rows.slice(i,i+size);q.push(env.DB.prepare('INSERT INTO '+table+'('+columns.join(',')+') VALUES '+chunk.map(()=> '('+columns.map(()=>'?').join(',')+')').join(',')).bind(...chunk.flatMap(row=>columns.map(c=>row[c]))))}
  };
  bulk('lessons',['id','title','position'],data.lessons);
  bulk('words',['id','lesson_id','group_no','spelling','meaning','image'],data.words);
  bulk('progress',['user_id','word_id','mode','correct','wrong','streak','missed'],data.progress);
  bulk('unlocks',['user_id','lesson_id','stage'],data.unlocks);
  bulk('stage_access',['user_id','lesson_id','mode','allowed'],data.stageAccess);
  // Keep one import inside one D1 transaction; refuse overly large imports rather than partial writes.
  requireValue(q.length<=80,'備份超過單次匯入上限；需另行規劃分批遷移',413);
  try{await env.DB.batch(q)}catch(e){const busy=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM progress)+(SELECT COUNT(*) FROM attempts)+(SELECT COUNT(*) FROM imports) n').first();if(busy.n)throw new ApiError('雲端已有進度或已匯入；不允許覆蓋',409);throw e}
  return json({ok:true,lessons:data.lessons.length,words:data.words.length,warnings:data.warnings});
}
async function admin(req,env,path){
  if(path==='/api/admin/stage-access'&&['POST','DELETE'].includes(req.method)){
    const b=await bodyJson(req);requireValue(integer(b.lessonId),'課次無效');
    requireValue(await env.DB.prepare('SELECT id FROM lessons WHERE id=?').bind(b.lessonId).first(),'無此課次',404);
    if(req.method==='DELETE')await env.DB.prepare("DELETE FROM stage_access WHERE user_id='ian' AND lesson_id=?").bind(b.lessonId).run();
    else{
      requireValue(MODES.includes(b.mode)&&typeof b.allowed==='boolean','階段設定無效');
      await env.DB.prepare("INSERT INTO stage_access(user_id,lesson_id,mode,allowed) VALUES('ian',?,?,?) ON CONFLICT(user_id,lesson_id,mode) DO UPDATE SET allowed=excluded.allowed").bind(b.lessonId,b.mode,Number(b.allowed)).run();
    }
    return json({ok:true});
  }
  if(path==='/api/admin/export'&&req.method==='GET')return json(legacyState(await state(env)));
  if(path==='/api/admin/import'&&req.method==='POST')return importBackup(req,env);
  if(path==='/api/admin/words'&&req.method==='POST'){
    const b=await bodyJson(req),spelling=normalizeSpelling(b.spelling),meaning=typeof b.meaning==='string'?b.meaning.trim():'';
    requireValue(integer(b.lessonId)&&integer(b.groupNo)&&/^[A-Za-z]+(?:[-' ][A-Za-z]+)*$/.test(spelling)&&spelling.length<=100&&meaning&&meaning.length<=120&&(b.image==null||(typeof b.image==='string'&&b.image.length<=500)),'欄位無效');
    requireValue(await env.DB.prepare('SELECT id FROM lessons WHERE id=?').bind(b.lessonId).first(),'無此課次',404);
    if(b.id!=null){requireValue(integer(b.id),'單字 id 無效');requireValue(await env.DB.prepare('SELECT id FROM words WHERE id=?').bind(b.id).first(),'無此單字',404)}
    const duplicate=await env.DB.prepare('SELECT id FROM words WHERE lesson_id=? AND spelling=? AND id!=?').bind(b.lessonId,spelling,b.id??-1).first();requireValue(!duplicate,'同課已有相同拼字',409);
    if(b.id!=null)await env.DB.prepare('UPDATE words SET lesson_id=?,group_no=?,spelling=?,meaning=?,image=? WHERE id=?').bind(b.lessonId,b.groupNo,spelling,meaning,b.image||null,b.id).run();
    else await env.DB.prepare('INSERT INTO words(lesson_id,group_no,spelling,meaning,image) VALUES(?,?,?,?,?)').bind(b.lessonId,b.groupNo,spelling,meaning,b.image||null).run();
    return json({ok:true});
  }
  if(path==='/api/admin/words'&&req.method==='DELETE'){
    const b=await bodyJson(req);requireValue(integer(b.id),'單字 id 無效');requireValue(await env.DB.prepare('SELECT id FROM words WHERE id=?').bind(b.id).first(),'無此單字',404);
    await env.DB.batch([env.DB.prepare('DELETE FROM attempts WHERE word_id=?').bind(b.id),env.DB.prepare('DELETE FROM words WHERE id=?').bind(b.id)]);return json({ok:true});
  }
  if(path==='/api/admin/lessons'&&req.method==='POST'){
    const b=await bodyJson(req),title=typeof b.title==='string'?b.title.trim():'';requireValue(title&&title.length<=50,'課名無效');
    await env.DB.prepare('INSERT INTO lessons(title,position) SELECT ?,COALESCE(MAX(position),0)+1 FROM lessons').bind(title).run();return json({ok:true});
  }
  if(path==='/api/admin/reset'&&req.method==='POST'){
    const b=await bodyJson(req);requireValue(integer(b.lessonId),'課次無效');requireValue(await env.DB.prepare('SELECT id FROM lessons WHERE id=?').bind(b.lessonId).first(),'無此課次',404);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM attempts WHERE user_id='ian' AND word_id IN (SELECT id FROM words WHERE lesson_id=?)").bind(b.lessonId),
      env.DB.prepare("DELETE FROM progress WHERE user_id='ian' AND word_id IN (SELECT id FROM words WHERE lesson_id=?)").bind(b.lessonId),
      env.DB.prepare("DELETE FROM unlocks WHERE user_id='ian' AND lesson_id=?").bind(b.lessonId)
    ]);return json({ok:true});
  }
  throw new ApiError('找不到 API',404);
}
async function handle(req,env){
  const path=new URL(req.url).pathname;
  if(path==='/api/health'&&req.method==='GET'){
    await env.DB.prepare('SELECT missed FROM progress LIMIT 1').all();
    await env.DB.prepare('SELECT id FROM imports LIMIT 1').all();
    await env.DB.prepare('SELECT allowed FROM stage_access LIMIT 1').all();
    return json({ok:true,db:true,schema:3,version:packageInfo.version,environment:env.DEPLOYMENT_ENV||'local'});
  }
  if(path==='/api/login'&&req.method==='POST')return login(req,env);
  const u=await session(req,env);requireValue(u,'登入已失效',401);
  if(path==='/api/state'&&req.method==='GET')return json(await state(env));
  if(path==='/api/attempt'&&req.method==='POST'){requireValue(u.role==='student','需要學生登入',403);return attempt(req,env)}
  if(path.startsWith('/api/admin/')){requireValue(u.role==='admin','沒有權限',403);return admin(req,env,path)}
  throw new ApiError('找不到 API',404);
}
export default {async fetch(req,env){
  const origin=req.headers.get('origin'),allowed=env.FRONTEND_ORIGIN;
  const respond=r=>{if(allowed)r.headers.set('access-control-allow-origin',allowed);r.headers.set('vary','Origin');return r};
  if(origin&&origin!==allowed)return json({error:'origin not allowed'},403);
  if(req.method==='OPTIONS'){
    const r=new Response(null,{status:204,headers:{'access-control-allow-methods':'GET,POST,DELETE,OPTIONS','access-control-allow-headers':'Content-Type,Authorization','access-control-max-age':'600'}});return respond(r);
  }
  if(!env.DB||typeof env.SESSION_SECRET!=='string'||env.SESSION_SECRET.length<32||!allowed)return respond(json({error:'伺服器尚未完成設定'},503));
  try{return respond(await handle(req,env))}catch(e){return respond(json({error:e instanceof ApiError?e.message:'請求處理失敗'},e instanceof ApiError?e.status:500))}
}};
