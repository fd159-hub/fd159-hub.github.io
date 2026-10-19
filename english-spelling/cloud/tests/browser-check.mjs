import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {runtime} from './runtime.mjs';
const require=createRequire(import.meta.url);
const {chromium}=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright'):await import('playwright');
const {mf,db}=await runtime();
const root=fileURLToPath(new URL('../../../',import.meta.url));
const staticServer=createServer(async(req,res)=>{
 try{const path=new URL(req.url,'http://localhost').pathname;const file=root+path.replace(/^\//,'')+(path.endsWith('/')?'index.html':'');if(!file.startsWith(root))throw Error('path');const content=await readFile(file);res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':'text/html'});res.end(content)}catch{res.writeHead(404);res.end()}
});
const apiServer=createServer(async(req,res)=>{
 try{let body='';for await(const c of req)body+=c;const r=await mf.dispatchFetch('http://localhost:8787'+req.url,{method:req.method,headers:req.headers,...(body?{body}:{})});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))}catch(e){res.writeHead(500);res.end(JSON.stringify({error:String(e)}))}
});
await new Promise(r=>staticServer.listen(4173,'127.0.0.1',r));await new Promise(r=>apiServer.listen(8787,'127.0.0.1',r));
let browser;let groups=0;const errors=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.IAN_BROWSER_EXECUTABLE?{executablePath:process.env.IAN_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']}:{})});
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 await context.addInitScript(()=>{
  window.__utterances=[];window.__speechMetadata=[];window.__voiceFixtures=[{lang:'en-GB',name:'British'},{lang:'en-US',name:'American'}];
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;this.voice=null}};
  speechSynthesis.getVoices=()=>window.__voiceFixtures;
  speechSynthesis.speak=u=>{window.__utterances.push(u.text);window.__speechMetadata.push({text:u.text,lang:u.lang,voice:u.voice?.name||null});queueMicrotask(()=>u.onend?.())};speechSynthesis.cancel=()=>{};
  if(!localStorage.getItem('ian-lessons-v3'))localStorage.setItem('ian-local-preserved','sentinel');
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4173/english-spelling/');
 await page.evaluate(()=>localStorage.setItem('ian-unlock-v3',JSON.stringify({0:4})));
 await page.reload();await page.locator('#ianLogin').click();await page.locator('#start').click();
 await page.waitForFunction(()=>document.querySelectorAll('.alphabetKey').length===31&&!document.querySelector('.alphabetKey').disabled);
 await page.locator('.alphabetKey').first().click();assert.equal(await page.locator('#entry').inputValue(),'a');
 assert.equal(await page.evaluate(()=>window.__utterances.at(-1)),'ay');
 assert.deepEqual(await page.evaluate(()=>window.__speechMetadata.at(-1)),{text:'ay',lang:'en-US',voice:'American'});
 assert.deepEqual(await page.evaluate(()=>{const old=__voiceFixtures;__voiceFixtures=[old[0]];const u=americanVoice(new SpeechSynthesisUtterance('test'));__voiceFixtures=old;return {lang:u.lang,voice:u.voice}}),{lang:'en-US',voice:null});
 await page.locator('.utilityKey').first().click();await page.locator('.alphabetKey').first().click();assert.equal(await page.locator('#entry').inputValue(),'aA');
 await page.locator('.utilityKey').last().click();assert.equal(await page.locator('#entry').inputValue(),'a');groups++;
 // Local independent switches and the all-closed learner state.
 await page.evaluate(()=>admin());
 for(const m of ['listen','tiles','missing','picture','dictation'])await page.locator('[data-stage="'+m+'"]').uncheck();
 await page.locator('[data-stage="review"]').check();await page.locator('[data-stage="review"]').uncheck();
 await page.evaluate(()=>{learner();$('start').click()});
 assert.equal(await page.locator('[data-mode="listen"]').isDisabled(),true);
 assert.equal(await page.locator('#playline').textContent(),'本課所有階段已關閉，請洽管理者開放。');
 await page.evaluate(()=>admin());await page.locator('#restoreAutoUnlock').click();
 assert.equal(await page.locator('[data-stage="dictation"]').isChecked(),true);
 assert.equal(await page.evaluate(()=>stageUnlock[0]),4);groups++;
 await page.evaluate(()=>{learner();$('gate').classList.add('hidden');lesson=1;mode='listen';makeQueue();idx=queue.findIndex(w=>w.listenVariants);render()});
 await page.waitForFunction(()=>!pending&&window.__speechMetadata.at(-1)?.text==='miss');
 assert.equal(await page.evaluate(()=>queue.length),8);assert.equal(await page.evaluate(()=>countMastered('listen').total),8);
 assert.equal(await page.locator('.option').filter({hasText:/^Miss \/ miss$/}).count(),1);
 assert(!(await page.locator('.option').allTextContents()).some(x=>x==='Miss'||x==='miss'));
 assert.deepEqual(await page.evaluate(()=>window.__speechMetadata.at(-1)),{text:'miss',lang:'en-US',voice:'American'});
 await page.getByRole('button',{name:'Miss / miss',exact:true}).click();
 assert.equal(await page.evaluate(()=>history['1|listen|Miss'].good),1);assert.equal(await page.evaluate(()=>history['1|listen|miss'].good),1);
 await page.evaluate(()=>{clearTimeout(transitionTimer);removeResult();lesson=0;mode='dictation';admin()});groups++;
 // Save a real phrase via the local manager, then exercise all six stages.
 await page.locator('#editEnglish').fill('  pencil   case  ');await page.locator('#editChinese').fill('鉛筆盒');await page.locator('#saveWord').click();
 assert.equal(await page.evaluate(()=>lessons[0].words.at(-1).en),'pencil case');
 const chooseTile=async character=>{if(character===' ')await page.getByRole('button',{name:'空格',exact:true}).click();else await page.locator('.tile:not(:disabled)').filter({hasText:new RegExp('^'+character+'$')}).first().click()};
 for(const m of ['listen','tiles','missing','picture','dictation','review']){
   await page.evaluate(m=>{clearTimeout(transitionTimer);removeResult();transitionBusy=false;lesson=0;mode=m;stageAccess['0|'+m]=true;makeQueue();idx=queue.findIndex(w=>w.en==='pencil case');screen='learner';$('adminScreen').hidden=true;render()},m);
   await page.waitForFunction(()=>!pending&&document.querySelector('#playline').textContent.includes('現在可以作答'));
   if(m==='listen')await page.getByRole('button',{name:'pencil case',exact:true}).click();
   else{
     if(m==='tiles'||m==='picture'){assert.equal(await page.getByRole('button',{name:'空格',exact:true}).count(),1);for(const c of 'pencil case')await chooseTile(c)}
     if(m==='missing'){assert(await page.evaluate(()=>hiddenPositions.every(i=>/[A-Za-z]/.test(current().en[i]))));assert.equal(await page.locator('.spaceSlot').textContent(),'␣');for(const c of await page.evaluate(()=>hiddenPositions.map(i=>current().en[i])))await chooseTile(c)}
     if(m==='dictation'){for(const c of 'pencil case')await page.getByRole('button',{name:c===' '?'輸入空格':'輸入 '+c,exact:true}).click();assert.equal(await page.locator('#entry').inputValue(),'pencil case')}
     if(m==='review')await page.locator('#entry').fill('pencil case');
     await page.locator('#check').click();
   }
   assert.equal(await page.evaluate(m=>history['0|'+m+'|pencil case'].good,m),1);
 }
 await page.evaluate(()=>{clearTimeout(transitionTimer);removeResult();transitionBusy=false;admin()});groups++;
 const before=await page.evaluate(()=>JSON.stringify({...localStorage}));
 await page.goto('http://localhost:4173/english-spelling/?cloud=http://localhost:8787');
 await page.locator('#ianLogin').click();await page.locator('#authPassword').fill('test-student-pin');await page.locator('#authSubmit').click();await page.locator('#start').click();
 await page.waitForFunction(()=>document.querySelectorAll('.option').length>0&&!document.querySelector('.option').disabled);
 const target=await page.evaluate(()=>current().en);
 let aborted=false;await page.route('**/api/attempt',async route=>{if(!aborted){aborted=true;await route.fetch();await route.abort('failed')}else await route.continue()});
 await page.locator('.option').filter({hasText:new RegExp('^'+target+'$')}).click();
 await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('重試'));
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM attempts').first()).n,1);
 await page.locator('#check').click();await page.waitForFunction(()=>checked===true);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM attempts').first()).n,1);assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),before);groups++;
 // A separate browser context sees server state, with no browser-local progress.
 const second=await browser.newContext();const p2=await second.newPage();p2.on('pageerror',e=>errors.push(e.message));
 await p2.goto('http://localhost:4173/english-spelling/?cloud=http://localhost:8787');await p2.locator('#ianLogin').click();await p2.locator('#authPassword').fill('test-student-pin');await p2.locator('#authSubmit').click();
 await p2.waitForFunction(()=>document.querySelector('#authGate').hidden);
 assert.equal(await p2.evaluate(()=>Object.values(history).reduce((n,p)=>n+p.good,0)),1);assert.equal(await p2.evaluate(()=>localStorage.length),0);
 await p2.reload();assert.equal(await p2.locator('#authGate').isVisible(),true);groups++;await second.close();
 await page.locator('#logout').click();await page.locator('#adminLogin').click();await page.locator('#authPassword').fill('test-admin-secret-unique');await page.locator('#authSubmit').click();await page.waitForFunction(()=>!document.querySelector('#adminScreen').hidden);
 await page.locator('#editEnglish').fill('apple');await page.locator('#editChinese').fill('蘋果');await page.locator('#saveWord').click();await page.locator('.adminRow b').filter({hasText:'apple'}).waitFor();
 assert.equal((await db.prepare("SELECT meaning FROM words WHERE spelling='apple'").first()).meaning,'蘋果');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#exportData').click()]);assert.equal(download.suggestedFilename(),'ian-spelling-cloud-backup.json');
 page.on('dialog',d=>d.accept());await page.locator('#resetLessonProgress').click();await page.waitForFunction(()=>Object.keys(history).length===0);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM progress').first()).n,0);assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),before);groups++;
 // Actual browser import round trip, including case-sensitive grouped variants.
 const backup={version:3,lessons:[{title:'瀏覽器匯入課',words:[{variants:[{en:'Miss',zh:'小姐'},{en:'miss',zh:'想念'}]}]}],history:{'0|listen|Miss':{good:2,bad:1}},misses:{'0|miss':true},stageUnlock:{0:1},attempts:{'0|listen':4}};
 await page.locator('#importFile').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await page.waitForFunction(()=>lessons[0]?.title==='瀏覽器匯入課');assert.equal(await page.locator('.adminRow').count(),2);assert.equal(await page.evaluate(()=>history['0|listen|Miss'].good),2);assert.equal(await page.evaluate(()=>misses['0|miss']),true);groups++;
 await page.setViewportSize({width:1024,height:768});await mkdir(root+'english-spelling/cloud/test-results',{recursive:true});await page.screenshot({path:root+'english-spelling/cloud/test-results/cloud-admin.png',fullPage:true});
 // Cloud switches persist on the backend and enforce access in a second context.
 const settled=()=>page.waitForFunction(()=>document.querySelector('#stageAccessStatus').textContent.startsWith('已儲存')&&!document.querySelector('#stageAccessFields').disabled);
 await page.locator('[data-stage="dictation"]').check();await settled();
 await page.locator('[data-stage="listen"]').uncheck();await settled();
 assert.equal((await db.prepare("SELECT allowed FROM stage_access WHERE lesson_id=1 AND mode='dictation'").first()).allowed,1);
 const accessContext=await browser.newContext();const accessPage=await accessContext.newPage();accessPage.on('pageerror',e=>errors.push(e.message));
 await accessPage.goto('http://localhost:4173/english-spelling/?cloud=http://localhost:8787');await accessPage.locator('#ianLogin').click();await accessPage.locator('#authPassword').fill('test-student-pin');await accessPage.locator('#authSubmit').click();await accessPage.waitForFunction(()=>document.querySelector('#authGate').hidden);
 assert.equal(await accessPage.locator('[data-mode="dictation"]').isEnabled(),true);assert.equal(await accessPage.locator('[data-mode="listen"]').isDisabled(),true);
 await accessPage.locator('#start').click();await accessPage.locator('[data-mode="dictation"]').click();assert.equal(await accessPage.evaluate(()=>mode),'dictation');
 await page.locator('#restoreAutoUnlock').click();await settled();
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM stage_access').first()).n,0);
 assert.equal(await page.locator('[data-stage="listen"]').isChecked(),true);assert.equal(await page.locator('[data-stage="dictation"]').isChecked(),false);
 assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),before);groups++;
 // Same single option reaches the real workerd API and records only one attempt.
 await accessPage.reload();await accessPage.locator('#ianLogin').click();await accessPage.locator('#authPassword').fill('test-student-pin');await accessPage.locator('#authSubmit').click();await accessPage.waitForFunction(()=>document.querySelector('#authGate').hidden);await accessPage.locator('#start').click();await accessPage.locator('[data-mode="listen"]').click();
 await accessPage.waitForFunction(()=>!pending&&!document.querySelector('.option').disabled);
 assert.equal(await accessPage.locator('.option').count(),1);assert.equal(await accessPage.locator('.option').textContent(),'Miss / miss');
 await accessPage.locator('.option').click();await accessPage.waitForFunction(()=>checked===true);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM attempts').first()).n,1);
 assert.equal((await db.prepare("SELECT streak FROM progress p JOIN words w ON w.id=p.word_id WHERE spelling='miss' AND mode='listen'").first()).streak,1);
 await accessContext.close();groups++;
 // Manager saves and edits a spaced phrase against the real local workerd API.
 await page.locator('#editEnglish').fill(' pencil   case ');await page.locator('#editChinese').fill('鉛筆盒');await page.locator('#saveWord').click();
 await page.waitForFunction(()=>lessons[0].words.some(w=>w.en==='pencil case'));
 const phrase=await db.prepare("SELECT * FROM words WHERE spelling='pencil case'").first();assert(phrase);assert.equal(phrase.image,'👝');
 const phraseRow=page.locator('.adminRow').filter({has:page.locator('b',{hasText:'pencil case'})});
 await phraseRow.getByRole('button',{name:'✏️ 修改',exact:true}).click();await page.locator('#editChinese').fill('鉛筆盒（片語）');await page.locator('#saveWord').click();
 await page.waitForFunction(()=>lessons[0].words.some(w=>w.en==='pencil case'&&w.zh==='鉛筆盒（片語）'));
 assert.equal((await db.prepare('SELECT meaning FROM words WHERE id=?').bind(phrase.id).first()).meaning,'鉛筆盒（片語）');groups++;
 assert.deepEqual(errors,[]);console.log('PASS: '+groups+' browser integration groups; no page errors; localStorage unchanged in cloud mode');
}finally{await browser?.close();await new Promise(r=>staticServer.close(r));await new Promise(r=>apiServer.close(r));await mf.dispose()}
