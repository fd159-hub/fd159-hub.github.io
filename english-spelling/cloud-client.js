/* Optional cloud mode. The default URL remains the original local application. */
(()=>{
  const APP_VERSION='1.0.0';
  const DEFAULT_ENDPOINTS={'ian-spelling.pages.dev':'https://ian-spelling-api.fd159.workers.dev','ian-spelling-staging.pages.dev':'https://ian-spelling-api-staging.fd159.workers.dev'};
  const connect=document.createElement('button');connect.textContent='☁️ 連接雲端';connect.style.cssText='margin-top:12px;padding:10px;border-radius:12px';
  document.querySelector('.authCard').append(connect);
  connect.onclick=()=>{const value=prompt('請輸入已部署的 Worker 網址（https://…workers.dev）');if(value){const u=new URL(location.href);u.searchParams.set('cloud',value.trim());location.href=u.href}};
  if(!window.IAN_CLOUD_ACTIVE)return;
  let endpoint,token=null,loginRole='student',busy=false,pendingAttempt=null;
  try{
    const u=new URL(new URLSearchParams(location.search).get('cloud')||DEFAULT_ENDPOINTS[location.hostname]);
    if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))throw Error('需要 HTTPS 網址；本機測試可使用 localhost');
    endpoint=u.origin;
  }catch{
    document.querySelector('.authCard').replaceChildren(Object.assign(document.createElement('p'),{textContent:'雲端網址無效，請移除網址的 cloud 參數後重試。'}));return;
  }
  const environmentLabel=endpoint===DEFAULT_ENDPOINTS['ian-spelling.pages.dev']?'正式站':endpoint===DEFAULT_ENDPOINTS['ian-spelling-staging.pages.dev']?'測試站':'自訂雲端';
  connect.textContent='開啟原本本機版';connect.onclick=()=>{if(DEFAULT_ENDPOINTS[location.hostname]){location.href='https://fd159-hub.github.io/english-spelling/';return}const u=new URL(location.href);u.searchParams.delete('cloud');location.href=u.href};
  document.querySelector('.authCard>p:last-of-type').textContent=environmentLabel+' v'+APP_VERSION+'：登入後同步至 '+endpoint;
  document.querySelector('footer').textContent=environmentLabel+' v'+APP_VERSION+'｜本機舊紀錄保留｜登入憑證只保留於本分頁記憶體';
  const versionBadge=document.createElement('span');versionBadge.textContent=environmentLabel+' v'+APP_VERSION;versionBadge.style.cssText='font-size:16px;color:#66577d';document.querySelector('.adminHead h2').append(' ',versionBadge);
  document.querySelector('#adminScreen .adminShell>p').textContent='此頁修改會儲存至雲端。匯入僅接受尚無學習進度的資料庫；原瀏覽器紀錄不會刪除。';
  $('exportData').textContent='⬇ 匯出雲端備份';$('importData').textContent='⬆ 匯入舊版備份';
  const localLogout=logout;
  logout=()=>{token=null;pendingAttempt=null;busy=false;localLogout();$('authSubmit').disabled=false};
  $('logout').onclick=logout;$('adminLogout').onclick=logout;
  async function api(path,body,method=body===undefined?'GET':'POST'){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const r=await fetch(endpoint+path,{method,mode:'cors',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const data=await r.json();if(!r.ok){if(r.status===401&&path!=='/api/login')logout();throw Error(data.error||'雲端請求失敗')};return data;
    }catch(e){if(e.name==='AbortError')throw Error('連線逾時，請重試；同一筆作答不會重複計算');throw e}finally{clearTimeout(timer)}
  }
  function applyState(s){
    const oldId=lessons[lesson]?.id,oldEditId=lessons[Number($('editLesson').value)]?.id;
    lessons=[];history={};misses={};stageUnlock={};attempts={};stageAccess={};
    s.lessons.forEach((l,li)=>{
      const groups=new Map();
      s.words.filter(w=>w.lesson_id===l.id).forEach(w=>{
        const word={en:w.spelling,zh:w.meaning,id:w.id,image:w.image,groupNo:w.group_no};
        if(!groups.has(w.group_no))groups.set(w.group_no,[]);groups.get(w.group_no).push(word);
        s.progress.filter(p=>p.word_id===w.id).forEach(p=>{
          history[li+'|'+p.mode+'|'+w.spelling]={good:p.streak,bad:p.wrong};
          attempts[li+'|'+p.mode]=(attempts[li+'|'+p.mode]||0)+p.correct+p.wrong;
          if(p.missed)misses[li+'|'+w.spelling]=true;
        });
      });
      lessons.push({id:l.id,title:l.title,words:[...groups.values()].map(v=>v.length===1?v[0]:{variants:v})});
      stageUnlock[li]=s.unlocks.find(u=>u.lesson_id===l.id)?.stage||0;
      for(const a of s.stageAccess||[])if(a.lesson_id===l.id)stageAccess[li+'|'+a.mode]=Boolean(a.allowed);
    });
    lesson=Math.max(0,lessons.findIndex(l=>l.id===oldId));
    for(const id of ['lesson','editLesson']){
      const select=$(id);select.replaceChildren();lessons.forEach((l,i)=>select.append(new Option(l.title,i)));
    }
    $('lesson').value=String(lesson);$('editLesson').value=String(Math.max(0,lessons.findIndex(l=>l.id===oldEditId)));
  }
  const refresh=async()=>applyState(await api('/api/state'));
  function choose(role){loginRole=role;$('passwordBox').hidden=false;$('passwordPrompt').textContent=role==='admin'?'請輸入雲端管理密碼':'請輸入 IAN PIN';$('authPassword').placeholder=role==='admin'?'管理密碼':'IAN PIN';$('authSubmit').textContent='登入雲端';$('authMessage').textContent='';$('authPassword').value='';$('authPassword').focus()}
  $('ianLogin').onclick=()=>choose('student');$('adminLogin').onclick=()=>choose('admin');
  $('authSubmit').onclick=async()=>{
    if(busy)return;busy=true;$('authSubmit').disabled=true;
    try{
      const data=await api('/api/login',{role:loginRole,password:$('authPassword').value});token=data.token;$('authPassword').value='';await refresh();
      if(loginRole==='admin')admin();else learner();
    }catch(e){token=null;$('authMessage').textContent=e.message}finally{busy=false;$('authSubmit').disabled=false}
  };
  $('authPassword').onkeydown=e=>{if(e.key==='Enter')$('authSubmit').click()};
  check=async()=>{
    const w=current();if(!w||checked||pending||transitionBusy||busy)return;
    const answer=mode==='dictation'||mode==='review'?$('entry').value.trim():mode==='missing'?(()=>{const letters=[...w.en];hiddenPositions.forEach((p,i)=>letters[p]=selected[i]||'');return letters.join('')})():selected.join('');
    const fingerprint=JSON.stringify([w.id,mode,answer]);
    if(!pendingAttempt||pendingAttempt.fingerprint!==fingerprint)pendingAttempt={fingerprint,requestId:crypto.randomUUID()};
    busy=true;lock(true);$('feedback').className='feedback';$('feedback').textContent='☁️ 正在儲存作答…';
    try{
      const oldStage=Number(stageUnlock[lesson]||0);
      const result=await api('/api/attempt',{wordId:w.id,mode,answer,requestId:pendingAttempt.requestId});
      await refresh();pendingAttempt=null;checked=true;
      newlyUnlocked=result.stage>oldStage&&isUnlocked(STAGES[result.stage])?STAGES[result.stage]:null;
      $('feedback').textContent='';showModeButtons();lock(true);announceResult(result.correct,w);
    }catch(e){$('feedback').className='feedback bad';$('feedback').textContent=e.message+'；請按檢查答案重試';$('check').classList.remove('hidden');lock(false)}finally{busy=false}
  };
  $('check').onclick=()=>check();
  // Prevent navigation from changing the question while a save is in flight.
  const oldPick=pickMode;pickMode=m=>{if(!busy)oldPick(m)};
  const oldLessonChange=$('lesson').onchange;$('lesson').onchange=e=>{if(busy){$('lesson').value=String(lesson);return}pendingAttempt=null;oldLessonChange(e)};
  const oldClear=$('clear').onclick;$('clear').onclick=()=>{if(!busy)oldClear()};
  async function mutate(path,body,method){
    if(busy)return false;busy=true;
    try{await api(path,body,method);await refresh();editPosition=null;drawAdminList();return true}catch(e){alert(e.message);return false}finally{busy=false}
  }
  drawAdminList=()=>{
    drawStageAccess();
    const li=Number($('editLesson').value||0);$('adminList').replaceChildren();
    for(const group of lessons[li]?.words||[])for(const w of group.variants||[group]){
      const row=document.createElement('div');row.className='adminRow';
      const en=document.createElement('b'),zh=document.createElement('span');en.textContent=w.en;zh.textContent=w.zh;
      const edit=document.createElement('button'),del=document.createElement('button');edit.textContent='✏️ 修改';del.textContent='🗑️ 刪除';
      edit.onclick=()=>{if(busy)return;editPosition={id:w.id,groupNo:w.groupNo,image:w.image,li};$('editEnglish').value=w.en;$('editChinese').value=w.zh};
      del.onclick=()=>{if(confirm('確定從雲端刪除 '+w.en+' 及其學習紀錄？'))mutate('/api/admin/words',{id:w.id},'DELETE')};
      row.append(en,zh,edit,del);$('adminList').append(row);
    }
  };
  setStageAccess=async(li,m,allowed)=>{
    if(busy)return false;
    return mutate('/api/admin/stage-access',{lessonId:lessons[li].id,...(m===null?{}:{mode:m,allowed})},m===null?'DELETE':'POST');
  };
  $('saveWord').onclick=async()=>{
    const li=editPosition?.li??Number($('editLesson').value),l=lessons[li],all=l.words.flatMap(g=>g.variants||[g]);
    const ok=await mutate('/api/admin/words',{...(editPosition?{id:editPosition.id}:{}),lessonId:l.id,groupNo:editPosition?.groupNo??Math.max(0,...all.map(w=>w.groupNo))+1,spelling:normalizeSpelling($('editEnglish').value),meaning:$('editChinese').value,image:editPosition?.image??WORD_IMAGES[normalizeSpelling($('editEnglish').value)]??null});
    if(ok){$('editEnglish').value='';$('editChinese').value=''}
  };
  $('addLesson').onclick=()=>{const title=prompt('新課名稱');if(title)mutate('/api/admin/lessons',{title})};
  $('resetLessonProgress').onclick=()=>{const l=lessons[Number($('editLesson').value)];if(confirm('確定重置雲端「'+l.title+'」全部模式、錯題與解鎖？其他課次不受影響。'))mutate('/api/admin/reset',{lessonId:l.id})};
  $('exportData').onclick=async()=>{
    try{const data=await api('/api/admin/export'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='ian-spelling-cloud-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){alert(e.message)}
  };
  $('importFile').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      if(file.size>1000000)throw Error('備份超過 1 MB 上限');
      const backup=JSON.parse(await file.text());
      if(!Array.isArray(backup.lessons))throw Error('備份格式無效');
      const count=backup.lessons.reduce((n,l)=>n+(l.words||[]).reduce((n,g)=>n+(g.variants||[g]).length,0),0);
      if(!confirm('即將匯入 '+backup.lessons.length+' 課、'+count+' 筆單字及進度，替換雲端單字庫。只允許雲端尚無進度時匯入。原始本機資料保持保留，請先保存備份。確定繼續？'))return;
      const result=await api('/api/admin/import',{backup,confirm:'IMPORT_BACKUP'});await refresh();drawAdminList();alert('匯入完成。'+result.warnings.join('\n'));
    }catch(err){alert('匯入失敗：'+err.message)}finally{e.target.value=''}
  };
  // No localStorage or sessionStorage token: reloading intentionally requires login.
})();
