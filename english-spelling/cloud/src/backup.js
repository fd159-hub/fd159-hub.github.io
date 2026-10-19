export const MODES = ['listen','tiles','missing','picture','dictation','review'];
export const IMAGES = {one:'1️⃣',two:'2️⃣',three:'3️⃣',red:'🔴',blue:'🔵',green:'🟢',pink:'🩷',purple:'🟣',pen:'🖊️',pencil:'✏️',book:'📖',cap:'🧢',teacher:'👩‍🏫',class:'🏫',English:'🔤'};
const count = x => Number.isSafeInteger(x) && x >= 0 && x <= 10000000;
const validWord = w => w && typeof w.en==='string' && /^[A-Za-z]+(?:[-'][A-Za-z]+)*$/.test(w.en) && w.en.length<=100 && typeof w.zh==='string' && w.zh.trim().length>0 && w.zh.length<=120;
export function normalizeBackup(b) {
  if (!b || b.version!==3 || !Array.isArray(b.lessons) || !b.lessons.length || b.lessons.length>100) throw Error('備份格式或版本無效');
  const lessons=[],words=[],progress=[],unlocks=[],stageAccess=[];
  let id=0;
  b.lessons.forEach((l,li)=>{
    if(typeof l.title!=='string'||!l.title.trim()||l.title.length>50||!Array.isArray(l.words)||l.words.length>500)throw Error('課次格式無效');
    lessons.push({id:li+1,title:l.title,position:li+1});
    const seen=new Set();
    l.words.forEach((group,gi)=>{
      const variants=group.variants||[group];
      if(!Array.isArray(variants)||!variants.length)throw Error('單字組格式無效');
      variants.forEach(w=>{
        if(!validWord(w)||seen.has(w.en))throw Error('單字無效或同課拼字重複，需人工對照');
        seen.add(w.en);
        const row={id:++id,lesson_id:li+1,group_no:gi+1,spelling:w.en,meaning:w.zh,image:Object.hasOwn(w,'image')?w.image:(IMAGES[w.en]??null)};
        if(row.image!==null&&(typeof row.image!=='string'||row.image.length>500))throw Error('圖片格式無效');
        words.push(row);
      });
    });
  });
  if(words.length>2000)throw Error('單字數量過多');
  const maps=['history','misses','stageUnlock','attempts','stageAccess'];
  for(const name of maps)if(b[name]!==undefined&&(!b[name]||typeof b[name]!=='object'||Array.isArray(b[name])))throw Error('進度格式無效');
  const byKey=new Map(words.map(w=>[(w.lesson_id-1)+'|'+w.spelling,w]));
  for(const [key,value] of Object.entries(b.history||{})){
    const [li,mode,...en]=key.split('|');const w=byKey.get(li+'|'+en.join('|'));
    if(!w||!MODES.includes(mode)||!value||!count(value.good)||!count(value.bad))throw Error('有無法對照的學習紀錄');
    // Legacy good is the current streak, not a lifetime correct count.
    progress.push({user_id:'ian',word_id:w.id,mode,correct:value.good,wrong:value.bad,streak:value.good,missed:0});
  }
  for(const [key,value] of Object.entries(b.misses||{})){
    const w=byKey.get(key);if(!w||typeof value!=='boolean')throw Error('有無法對照的錯題紀錄');
    if(!value)continue;
    let p=progress.find(p=>p.word_id===w.id);
    if(!p){p={user_id:'ian',word_id:w.id,mode:'listen',correct:0,wrong:0,streak:0,missed:1};progress.push(p)}
    p.missed=1;
  }
  for(const [li,stage] of Object.entries(b.stageUnlock||{})){
    if(!/^(0|[1-9][0-9]*)$/.test(li)||!lessons[Number(li)]||!Number.isInteger(stage)||stage<0||stage>5)throw Error('解鎖紀錄無效');
    unlocks.push({user_id:'ian',lesson_id:Number(li)+1,stage:stage===3&&!words.some(w=>w.lesson_id===Number(li)+1&&w.image)?4:stage});
  }
  for(const [key,n] of Object.entries(b.attempts||{})){
    const [li,mode,...extra]=key.split('|');if(extra.length||!lessons[Number(li)]||!MODES.includes(mode)||!count(n))throw Error('練習次數格式無效');
  }
  for(const [key,allowed] of Object.entries(b.stageAccess||{})){
    const [li,mode,...extra]=key.split('|');
    if(extra.length||!/^(0|[1-9][0-9]*)$/.test(li)||!lessons[Number(li)]||!MODES.includes(mode)||typeof allowed!=='boolean')throw Error('階段開關格式無效');
    stageAccess.push({user_id:'ian',lesson_id:Number(li)+1,mode,allowed:Number(allowed)});
  }
  return {lessons,words,progress,unlocks,stageAccess,warnings:['舊版 good 只代表目前連續答對數；無法還原歷史總答對次數或逐筆作答時間。舊 attempts 是各模式累計次數，保留於原始 JSON，並未偽造為雲端逐筆作答。']};
}
export function legacyState(s) {
  const sorted=s.lessons.slice().sort((a,b)=>a.position-b.position),lessons=[],history={},misses={},stageUnlock={},attempts={},stageAccess={};
  sorted.forEach((l,li)=>{
    const groups=new Map();
    for(const w of s.words.filter(w=>w.lesson_id===l.id)){
      const word={en:w.spelling,zh:w.meaning,image:w.image,id:w.id};
      if(!groups.has(w.group_no))groups.set(w.group_no,[]);groups.get(w.group_no).push(word);
      for(const p of s.progress.filter(p=>p.word_id===w.id)){
        history[li+'|'+p.mode+'|'+w.spelling]={good:p.streak,bad:p.wrong};
        attempts[li+'|'+p.mode]=(attempts[li+'|'+p.mode]||0)+p.correct+p.wrong;
        if(p.missed)misses[li+'|'+w.spelling]=true;
      }
    }
    lessons.push({id:l.id,title:l.title,words:[...groups.values()].map(v=>v.length===1?v[0]:{variants:v})});
    stageUnlock[li]=s.unlocks.find(u=>u.lesson_id===l.id)?.stage||0;
    for(const a of s.stageAccess||[])if(a.lesson_id===l.id)stageAccess[li+'|'+a.mode]=Boolean(a.allowed);
  });
  return {version:3,lessons,history,misses,stageUnlock,attempts,stageAccess};
}
