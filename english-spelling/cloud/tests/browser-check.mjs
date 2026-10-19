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
  window.__utterances=[];speechSynthesis.speak=u=>{window.__utterances.push(u.text);queueMicrotask(()=>u.onend?.())};speechSynthesis.cancel=()=>{};
  if(!localStorage.getItem('ian-lessons-v3'))localStorage.setItem('ian-local-preserved','sentinel');
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4173/english-spelling/');
 await page.evaluate(()=>localStorage.setItem('ian-unlock-v3',JSON.stringify({0:4})));
 await page.reload();await page.locator('#ianLogin').click();await page.locator('#start').click();
 await page.waitForFunction(()=>document.querySelectorAll('.alphabetKey').length===28&&!document.querySelector('.alphabetKey').disabled);
 await page.locator('.alphabetKey').first().click();assert.equal(await page.locator('#entry').inputValue(),'a');
 assert.equal(await page.evaluate(()=>window.__utterances.at(-1)),'ay');
 await page.locator('.utilityKey').first().click();await page.locator('.alphabetKey').first().click();assert.equal(await page.locator('#entry').inputValue(),'aA');
 await page.locator('.utilityKey').last().click();assert.equal(await page.locator('#entry').inputValue(),'a');groups++;
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
 assert.deepEqual(errors,[]);console.log('PASS: '+groups+' browser integration groups; no page errors; localStorage unchanged in cloud mode');
}finally{await browser?.close();await new Promise(r=>staticServer.close(r));await new Promise(r=>apiServer.close(r));await mf.dispose()}
