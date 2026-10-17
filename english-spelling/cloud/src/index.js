const MODES=['listen','tiles','missing','picture','dictation','review'];
const enc=new TextEncoder();
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const secureEq=(a,b)=>{const x=enc.encode(a),y=enc.encode(b);let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);return diff===0};
async function sign(payload,key){const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);const body=b64(enc.encode(JSON.stringify(payload)));return body+'.'+b64(await crypto.subtle.sign('HMAC',k,enc.encode(body)))}
async function session(req,env){const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');const [body,signature,...extra]=token.split('.');if(!body||!signature||extra.length)return null;const k=await crypto.subtle.importKey('raw',enc.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('HMAC',k,unb64(signature),enc.encode(body)))return null;const user=JSON.parse(new TextDecoder().decode(unb64(body)));return user.exp>Date.now()/1000?user:null}
const fail=(msg,status=400)=>json({error:msg},status);
async function bodyJson(req){const txt=await req.text();if(txt.length>120000)throw Error('payload too large');return JSON.parse(txt)}
async function state(env,user){const [ls,ws,ps,us]=await Promise.all([env.DB.prepare('SELECT * FROM lessons ORDER BY position').all(),env.DB.prepare('SELECT * FROM words ORDER BY lesson_id,group_no,id').all(),env.DB.prepare('SELECT * FROM progress WHERE user_id=?').bind(user).all(),env.DB.prepare('SELECT * FROM unlocks WHERE user_id=?').bind(user).all()]);return {lessons:ls.results,words:ws.results,progress:ps.results,unlocks:us.results,user}}
async function updateUnlock(env,user,lesson,stage){const stageModes=MODES.slice(0,5);if(stage<0||stage>=5)return 5;const mode=stageModes[stage];const total=await env.DB.prepare("SELECT COUNT(*) as n FROM words WHERE lesson_id=? AND (? != 'picture' OR image IS NOT NULL)").bind(lesson,mode).first();if(!total?.n)return stage;const done=await env.DB.prepare("SELECT COUNT(*) as n FROM words w JOIN progress p ON p.word_id=w.id AND p.user_id=? AND p.mode=? WHERE w.lesson_id=? AND p.streak>=2 AND (? != 'picture' OR w.image IS NOT NULL)").bind(user,mode,lesson,mode).first();if(done.n!==total.n)return stage;const newStage=stage+1;await env.DB.prepare('INSERT INTO unlocks(user_id,lesson_id,stage) VALUES(?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET stage=MAX(stage,excluded.stage)').bind(user,lesson,newStage).run();return newStage}
async function handle(req,env){
const url=new URL(req.url),path=url.pathname;
if(path==='/api/health'&&req.method==='GET')return json({ok:true,db:!!env.DB});
if(path==='/api/login'&&req.method==='POST'){const b=await bodyJson(req);const role=b.role==='admin'?'admin':'student';const secret=role==='admin'?env.ADMIN_PASSWORD:env.IAN_PIN;if(typeof b.password!=='string'||!secret||!secureEq(b.password,secret))return fail('帳號或密碼錯誤',401);const id=role==='admin'?'admin':'ian';return json({token:await sign({sub:id,role,exp:Math.floor(Date.now()/1000)+3600*12},env.SESSION_SECRET),role,expiresIn:43200})}
const u=await session(req,env);if(!u)return fail('登入已失效',401);
if(path==='/api/state'&&req.method==='GET')return json(await state(env,'ian'));
if(path==='/api/attempt'&&req.method==='POST'){
if(u.role!=='student')return fail('需要學生登入',403);
const b=await bodyJson(req),wordId=Number(b.wordId),mode=String(b.mode||''),answer=String(b.answer||'');
if(!Number.isInteger(wordId)||!MODES.includes(mode)||answer.length>100)return fail('作答格式錯誤');
const w=await env.DB.prepare('SELECT * FROM words WHERE id=?').bind(wordId).first();if(!w)return fail('無此單字',404);
const row=await env.DB.prepare('SELECT stage FROM unlocks WHERE user_id=? AND lesson_id=?').bind('ian',w.lesson_id).first();
const stage=row?.stage||0;if(MODES.indexOf(mode)>stage)return fail('尚未解鎖此關卡',403);
if(mode==='picture'&&!w.image)return fail('此字不適合圖片模式',400);
const correct=answer===w.spelling;
await env.DB.batch([
env.DB.prepare('INSERT INTO attempts(user_id,word_id,mode,correct) VALUES(?,?,?,?)').bind('ian',wordId,mode,Number(correct)),
env.DB.prepare('INSERT INTO progress(user_id,word_id,mode,correct,wrong,streak) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,word_id,mode) DO UPDATE SET correct=correct+excluded.correct,wrong=wrong+excluded.wrong,streak=CASE WHEN excluded.correct=1 THEN streak+1 ELSE 0 END').bind('ian',wordId,mode,Number(correct),Number(!correct),Number(correct))
]);
const newStage=correct?await updateUnlock(env,'ian',w.lesson_id,stage):stage;
return json({correct,spelling:correct?undefined:w.spelling,stage:newStage,unlocked:newStage>stage});
}
if(!path.startsWith('/api/admin/')||u.role!=='admin')return fail('沒有權限',403);
if(path==='/api/admin/words'&&req.method==='POST'){
const b=await bodyJson(req);const id=b.id==null?null:Number(b.id),lesson=Number(b.lessonId),group=Number(b.groupNo),spelling=String(b.spelling||'').trim(),meaning=String(b.meaning||'').trim(),image=b.image?String(b.image):null;
if(!Number.isInteger(lesson)||!Number.isInteger(group)||group<1||!/^[A-Za-z]+(?:[-'][A-Za-z]+)*$/.test(spelling)||!meaning||meaning.length>120)return fail('欄位無效');
if(id){await env.DB.prepare('UPDATE words SET lesson_id=?,group_no=?,spelling=?,meaning=?,image=? WHERE id=?').bind(lesson,group,spelling,meaning,image,id).run()}else{await env.DB.prepare('INSERT INTO words(lesson_id,group_no,spelling,meaning,image) VALUES(?,?,?,?,?)').bind(lesson,group,spelling,meaning,image).run()}
return json({ok:true});
}
if(path==='/api/admin/words'&&req.method==='DELETE'){const b=await bodyJson(req);await env.DB.prepare('DELETE FROM words WHERE id=?').bind(Number(b.id)).run();return json({ok:true})}
if(path==='/api/admin/lessons'&&req.method==='POST'){const b=await bodyJson(req),title=String(b.title||'').trim();if(!title||title.length>50)return fail('課名無效');const q=await env.DB.prepare('SELECT COALESCE(MAX(position),0)+1 AS next FROM lessons').first();await env.DB.prepare('INSERT INTO lessons(title,position) VALUES(?,?)').bind(title,q.next).run();return json({ok:true})}
if(path==='/api/admin/reset'&&req.method==='POST'){const b=await bodyJson(req),lesson=Number(b.lessonId);if(!Number.isInteger(lesson)||lesson<1)return fail('課次無效');await env.DB.batch([env.DB.prepare('DELETE FROM attempts WHERE user_id=? AND word_id IN (SELECT id FROM words WHERE lesson_id=?)').bind('ian',lesson),env.DB.prepare('DELETE FROM progress WHERE user_id=? AND word_id IN (SELECT id FROM words WHERE lesson_id=?)').bind('ian',lesson),env.DB.prepare('DELETE FROM unlocks WHERE user_id=? AND lesson_id=?').bind('ian',lesson)]);return json({ok:true})}
return fail('找不到 API',404);
}
export default {async fetch(req,env){const origin=req.headers.get('origin'),allowed=env.FRONTEND_ORIGIN;if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':allowed,'access-control-allow-methods':'GET,POST,DELETE,OPTIONS','access-control-allow-headers':'Content-Type,Authorization','access-control-max-age':'600'}});if(origin&&origin!==allowed)return fail('origin not allowed',403);if(!env.SESSION_SECRET||!env.DB)return fail('伺服器尚未完成設定',503);try{const r=await handle(req,env);r.headers.set('access-control-allow-origin',allowed);r.headers.set('vary','Origin');return r}catch(e){return json({error:'請求處理失敗',detail:env.DEV_DEBUG?String(e):undefined},500,{'access-control-allow-origin':allowed})}}};
