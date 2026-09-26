(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const STORAGE_KEY = "emiruto_state_v1";
  const AUTH_KEY = "emiruto_auth_v1";
  const DEVICE_KEY = "emiruto_device_id_v1";
  const iso = (d=new Date()) => {
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };
  const today = () => iso(new Date());
  const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);
  const addDays = (dateString, n) => { const d=new Date(dateString+"T00:00:00"); d.setDate(d.getDate()+n); return iso(d); };
  const fmtDate = (dateString) => new Intl.DateTimeFormat("ja-JP",{month:"long",day:"numeric",weekday:"short"}).format(new Date(dateString+"T00:00:00"));
  const esc = (v="") => String(v).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const priorityLabel = {urgent:"最優先",high:"高",normal:"普通",low:"低"};
  const priorityColor = {urgent:"#ef5b34",high:"#ff8a2b",normal:"#f2a85a",low:"#9aa7c9"};

  const defaultState = () => {
    const t=today();
    return {
      version:1,userName:"あなた",pinHash:null,theme:"orange",showOshi:true,stealth:false,quiet:false,
      gentleUntil:null,oshiImage:null,selectedDate:t,calendarCursor:t,minimalOnly:false,cloudModifiedAt:null,
      notifications:{
        enabled:false,style:"emiruto",
        morningEnabled:true,morningTime:"08:00",
        deadlineEnabled:true,deadline1:60,deadline2:15,
        eventEnabled:true,eventMinutes:15,
        unfinishedEnabled:true,unfinishedTime:"21:00",
        recapEnabled:true,recapTime:"22:30"
      },notificationLog:{},
      backgroundPush:{enabled:false,clientId:"",secret:"",lastSyncAt:null},
      tasks:[
        {id:uid(),title:"レポートの構成を決める",dueDate:t,dueTime:"18:00",priority:"high",progress:40,categories:["大学"],tags:["PC"],color:"#ff8a2b",minimal:true,today:true,completed:false,completedAt:null,postponeCount:0,someday:false,createdAt:new Date().toISOString(),memo:""},
        {id:uid(),title:"ギター練習",dueDate:t,dueTime:"21:00",priority:"normal",progress:0,categories:["音楽"],tags:[],color:"#f2a85a",minimal:false,today:true,completed:false,completedAt:null,postponeCount:0,someday:false,createdAt:new Date().toISOString(),memo:""},
        {id:uid(),title:"買い物リスト整理",dueDate:addDays(t,2),dueTime:"",priority:"low",progress:0,categories:["プライベート"],tags:[],color:"#9aa7c9",minimal:false,today:false,completed:false,completedAt:null,postponeCount:0,someday:false,createdAt:new Date().toISOString(),memo:""}
      ],
      events:[
        {id:uid(),title:"授業",date:t,start:"10:00",end:"11:30",location:"",attendee:"",color:"#5da8ff",memo:""},
        {id:uid(),title:"バイト",date:t,start:"15:00",end:"20:00",location:"",attendee:"",color:"#ff8a2b",memo:""}
      ],
      history:[],rareMemories:[],reactionHistory:[]
    };
  };

  let state = loadState();
  let currentTaskId = null;
  let currentEventId = null;
  let addType = "task";
  let pinBuffer = "";
  let pinStage = state.pinHash ? "unlock" : "setup";
  let setupPin = "";
  let longPressTimer = null;
  let reactionTimer = null;
  let notificationTimer = null;
  let pushSyncTimer = null;
  let pushSyncInProgress = false;
  let cloudAuth = loadCloudAuth();
  let cloudSyncTimer = null;
  let cloudSyncInProgress = false;
  let cloudSyncHydrating = false;
  let cloudLastFingerprint = "";
  let googleConfig = null;
  let googleIdentityReady = false;
  let googleScriptPromise = null;
  let calendarFilter = "all";
  let oshiCache = {};
  let recentVisuals = [];
  const OSHI_DB = "emiruto_media_v1";
  const OSHI_STORE = "oshiImages";
  cloudLastFingerprint=cloudFingerprint(state);
  const A="./assets/oshi/adopted/";
  const BUILTIN_OSHI = {
    normal:[A+"v1.jpg?v=20260926-10",A+"v2.jpg?v=20260926-10",A+"v5.jpg?v=20260926-10",A+"v28.jpg?v=20260926-14"],
    morning:[A+"v1.jpg?v=20260926-10",A+"v2.jpg?v=20260926-10",A+"v25.jpg?v=20260926-14"],
    day:[A+"v2.jpg?v=20260926-10",A+"v5.jpg?v=20260926-10",A+"v28.jpg?v=20260926-14"],
    night:[A+"v4.jpg?v=20260926-10",A+"v6.jpg?v=20260926-10",A+"v26.jpg?v=20260926-14"],
    lateNight:[A+"v4.jpg?v=20260926-10",A+"v27.jpg?v=20260926-14"],
    happy:[A+"v2.jpg?v=20260926-10",A+"v3.jpg?v=20260926-10",A+"v28.jpg?v=20260926-14"],
    bigHappy:[A+"v3.jpg?v=20260926-10",A+"v2.jpg?v=20260926-10",A+"v30.jpg?v=20260926-14"],
    relief:[A+"v1.jpg?v=20260926-10",A+"v6.jpg?v=20260926-10",A+"v25.jpg?v=20260926-14",A+"v27.jpg?v=20260926-14",A+"v29.jpg?v=20260926-14"],
    cheer:[A+"v3.jpg?v=20260926-10",A+"v2.jpg?v=20260926-10"],
    sad:[A+"v5.jpg?v=20260926-10",A+"v29.jpg?v=20260926-14"],
    pressure:[A+"v5.jpg?v=20260926-10"],
    gentle:[A+"v1.jpg?v=20260926-10",A+"v4.jpg?v=20260926-10",A+"v6.jpg?v=20260926-10",A+"v25.jpg?v=20260926-14",A+"v27.jpg?v=20260926-14"],
    rare:[A+"v4.jpg?v=20260926-10",A+"v5.jpg?v=20260926-10",A+"v26.jpg?v=20260926-14",A+"v29.jpg?v=20260926-14"],
    superRare:[A+"v4.jpg?v=20260926-10",A+"v26.jpg?v=20260926-14",A+"v30.jpg?v=20260926-14"],
    spring:[A+"v2.jpg?v=20260926-10",A+"v5.jpg?v=20260926-10"],
    summer:[A+"v2.jpg?v=20260926-10"],
    autumn:[A+"v3.jpg?v=20260926-10",A+"v5.jpg?v=20260926-10"],
    winter:[A+"v1.jpg?v=20260926-10",A+"v4.jpg?v=20260926-10",A+"v30.jpg?v=20260926-14"],
    rain:[A+"v5.jpg?v=20260926-10",A+"v29.jpg?v=20260926-14"],
    tanabata:[A+"v2.jpg?v=20260926-10"],
    halloween:[A+"v4.jpg?v=20260926-10"],
    christmas:[A+"v1.jpg?v=20260926-10",A+"v4.jpg?v=20260926-10",A+"v30.jpg?v=20260926-14"],
    newyear:[A+"v3.jpg?v=20260926-10"],
    apr22:[A+"v3.jpg?v=20260926-10",A+"v2.jpg?v=20260926-10"],
    hot:[A+"v2.jpg?v=20260926-10"],
    cold:[A+"v1.jpg?v=20260926-10",A+"v5.jpg?v=20260926-10"]
  };
  const ADOPTED_OSHI = {
    normal:[A+"v1.jpg?v=20260926-14",A+"v2.jpg?v=20260926-14",A+"v5.jpg?v=20260926-14",A+"v8.jpg?v=20260926-14",A+"v13.jpg?v=20260926-14",A+"v16.jpg?v=20260926-14",A+"v21.jpg?v=20260926-14",A+"v22.jpg?v=20260926-14",A+"v31.webp?v=20260927-04",A+"v33.webp?v=20260927-04",A+"v34.webp?v=20260927-04"],
    morning:[A+"v1.jpg?v=20260926-14",A+"v2.jpg?v=20260926-14",A+"v7.jpg?v=20260926-14",A+"v14.jpg?v=20260926-14",A+"v22.jpg?v=20260926-14",A+"v34.webp?v=20260927-04"],
    day:[A+"v2.jpg?v=20260926-14",A+"v6.jpg?v=20260926-14",A+"v8.jpg?v=20260926-14",A+"v13.jpg?v=20260926-14",A+"v15.jpg?v=20260926-14",A+"v16.jpg?v=20260926-14",A+"v21.jpg?v=20260926-14",A+"v22.jpg?v=20260926-14",A+"v24.jpg?v=20260926-14",A+"v31.webp?v=20260927-04",A+"v33.webp?v=20260927-04",A+"v34.webp?v=20260927-04"],
    night:[A+"v4.jpg?v=20260926-14",A+"v5.jpg?v=20260926-14",A+"v11.jpg?v=20260926-14",A+"v18.jpg?v=20260926-14",A+"v20.jpg?v=20260926-14",A+"v24.jpg?v=20260926-14",A+"v31.webp?v=20260927-04",A+"v32.webp?v=20260927-04",A+"v35.webp?v=20260927-04"],
    lateNight:[A+"v4.jpg?v=20260926-14",A+"v11.jpg?v=20260926-14",A+"v18.jpg?v=20260926-14",A+"v20.jpg?v=20260926-14",A+"v32.webp?v=20260927-04",A+"v35.webp?v=20260927-04"],
    happy:[A+"v2.jpg?v=20260926-14",A+"v3.jpg?v=20260926-14",A+"v6.jpg?v=20260926-14",A+"v10.jpg?v=20260926-14",A+"v13.jpg?v=20260926-14",A+"v15.jpg?v=20260926-14",A+"v16.jpg?v=20260926-14",A+"v19.jpg?v=20260926-14",A+"v21.jpg?v=20260926-14",A+"v23.jpg?v=20260926-14",A+"v24.jpg?v=20260926-14",A+"v34.webp?v=20260927-04",A+"v35.webp?v=20260927-04"],
    bigHappy:[A+"v3.jpg?v=20260926-14",A+"v10.jpg?v=20260926-14",A+"v15.jpg?v=20260926-14",A+"v23.jpg?v=20260926-14",A+"v35.webp?v=20260927-04"],
    relief:[A+"v1.jpg?v=20260926-14",A+"v6.jpg?v=20260926-14",A+"v9.jpg?v=20260926-14",A+"v11.jpg?v=20260926-14",A+"v14.jpg?v=20260926-14",A+"v18.jpg?v=20260926-14",A+"v19.jpg?v=20260926-14",A+"v24.jpg?v=20260926-14",A+"v31.webp?v=20260927-04",A+"v32.webp?v=20260927-04",A+"v34.webp?v=20260927-04"],
    cheer:[A+"v2.jpg?v=20260926-14",A+"v3.jpg?v=20260926-14",A+"v8.jpg?v=20260926-14",A+"v15.jpg?v=20260926-14",A+"v21.jpg?v=20260926-14",A+"v23.jpg?v=20260926-14",A+"v33.webp?v=20260927-04",A+"v35.webp?v=20260927-04"],
    sad:[A+"v4.jpg?v=20260926-14",A+"v5.jpg?v=20260926-14",A+"v12.jpg?v=20260926-14",A+"v17.jpg?v=20260926-14",A+"v20.jpg?v=20260926-14"],
    pressure:[A+"v5.jpg?v=20260926-14",A+"v12.jpg?v=20260926-14",A+"v20.jpg?v=20260926-14"],
    gentle:[A+"v1.jpg?v=20260926-14",A+"v4.jpg?v=20260926-14",A+"v7.jpg?v=20260926-14",A+"v11.jpg?v=20260926-14",A+"v12.jpg?v=20260926-14",A+"v14.jpg?v=20260926-14",A+"v17.jpg?v=20260926-14",A+"v18.jpg?v=20260926-14",A+"v19.jpg?v=20260926-14",A+"v24.jpg?v=20260926-14",A+"v31.webp?v=20260927-04",A+"v32.webp?v=20260927-04",A+"v33.webp?v=20260927-04",A+"v34.webp?v=20260927-04"],
    rare:[A+"v4.jpg?v=20260926-14",A+"v5.jpg?v=20260926-14",A+"v9.jpg?v=20260926-14",A+"v11.jpg?v=20260926-14",A+"v18.jpg?v=20260926-14",A+"v19.jpg?v=20260926-14",A+"v24.jpg?v=20260926-14",A+"v31.webp?v=20260927-04",A+"v32.webp?v=20260927-04",A+"v35.webp?v=20260927-04"],
    superRare:[A+"v4.jpg?v=20260926-14",A+"v9.jpg?v=20260926-14",A+"v18.jpg?v=20260926-14",A+"v19.jpg?v=20260926-14",A+"v32.webp?v=20260927-04"],
    spring:[A+"v1.jpg?v=20260926-14",A+"v2.jpg?v=20260926-14",A+"v8.jpg?v=20260926-14",A+"v13.jpg?v=20260926-14",A+"v21.jpg?v=20260926-14",A+"v22.jpg?v=20260926-14",A+"v34.webp?v=20260927-04"],
    summer:[A+"v2.jpg?v=20260926-14",A+"v8.jpg?v=20260926-14",A+"v15.jpg?v=20260926-14",A+"v21.jpg?v=20260926-14",A+"v31.webp?v=20260927-04",A+"v34.webp?v=20260927-04"],
    autumn:[A+"v3.jpg?v=20260926-14",A+"v5.jpg?v=20260926-14",A+"v8.jpg?v=20260926-14",A+"v13.jpg?v=20260926-14",A+"v16.jpg?v=20260926-14",A+"v23.jpg?v=20260926-14",A+"v33.webp?v=20260927-04"],
    winter:[A+"v1.jpg?v=20260926-14",A+"v6.jpg?v=20260926-14",A+"v7.jpg?v=20260926-14",A+"v11.jpg?v=20260926-14",A+"v14.jpg?v=20260926-14",A+"v18.jpg?v=20260926-14",A+"v20.jpg?v=20260926-14",A+"v32.webp?v=20260927-04"],
    rain:[A+"v5.jpg?v=20260926-14",A+"v12.jpg?v=20260926-14",A+"v17.jpg?v=20260926-14",A+"v20.jpg?v=20260926-14"],
    tanabata:[A+"v2.jpg?v=20260926-14",A+"v8.jpg?v=20260926-14",A+"v15.jpg?v=20260926-14",A+"v21.jpg?v=20260926-14"],
    halloween:[A+"v4.jpg?v=20260926-14",A+"v5.jpg?v=20260926-14",A+"v9.jpg?v=20260926-14",A+"v18.jpg?v=20260926-14",A+"v20.jpg?v=20260926-14",A+"v35.webp?v=20260927-04"],
    christmas:[A+"v4.jpg?v=20260926-14",A+"v6.jpg?v=20260926-14",A+"v10.jpg?v=20260926-14",A+"v11.jpg?v=20260926-14",A+"v14.jpg?v=20260926-14",A+"v18.jpg?v=20260926-14",A+"v24.jpg?v=20260926-14"],
    newyear:[A+"v1.jpg?v=20260926-14",A+"v3.jpg?v=20260926-14",A+"v10.jpg?v=20260926-14",A+"v13.jpg?v=20260926-14",A+"v23.jpg?v=20260926-14"],
    apr22:[A+"v2.jpg?v=20260926-14",A+"v3.jpg?v=20260926-14",A+"v10.jpg?v=20260926-14",A+"v13.jpg?v=20260926-14",A+"v15.jpg?v=20260926-14",A+"v23.jpg?v=20260926-14"],
    hot:[A+"v2.jpg?v=20260926-14",A+"v8.jpg?v=20260926-14",A+"v15.jpg?v=20260926-14",A+"v21.jpg?v=20260926-14"],
    cold:[A+"v1.jpg?v=20260926-14",A+"v7.jpg?v=20260926-14",A+"v11.jpg?v=20260926-14",A+"v14.jpg?v=20260926-14",A+"v18.jpg?v=20260926-14",A+"v20.jpg?v=20260926-14"]
  };

  const REACTION_LINES = {
    normal:["今日もひとつずついこ〜！","無理なく進めれば大丈夫。今日も応援してる🧡","できるところから始めよっか。"],
    morning:["おはよう〜！今日もゆっくり始めよ🧡","朝から来てくれてうれしい。まずひとつだけやろ？","眠くても大丈夫、最初の一歩だけいこ〜！"],
    day:["ここまでちゃんと進めてるのえらい！","午後も焦らずひとつずつね🧡","まだまだいけるよ、でも無理はしないでね。"],
    night:["今日もおつかれさま。あと少しだけね🧡","夜まで頑張ってるの、ちゃんと見えてるよ。","ここまで来たら、残りはゆっくりで大丈夫。"],
    lateNight:["こんな時間までほんとにおつかれさま。無理しすぎないでね。","もう十分頑張ってるよ。今日はここで終わっても大丈夫🧡","夜更かししすぎないでね。ひと区切りつけよ？"],
    happy:["やったぁ！ちゃんと終わらせたのえらい〜！","ひとつ完了！この調子すごくいい🧡","終わった〜！頑張った分ちゃんと進んでるよ。"],
    bigHappy:["え、もう終わったの！？すごすぎる🧡","今日はかなり頑張ったじゃん！ほんとにえらい！","これは大拍手したいくらいすごい〜！"],
    relief:["間に合った〜！ちゃんとやり切ったのえらい！","終わってほっとしたね。おつかれさま🧡","ちゃんと最後までやったの、本当にえらいよ。"],
    cheer:["いけるいける！あとちょっとだけ一緒に頑張ろ🧡","ここまで来たなら大丈夫。焦らず続けよ！","進んでるよ〜！そのままで大丈夫！"],
    sad:["残ってるのあるね…でも今からひとつだけでも一緒にやろ？","まだ終わってなくても大丈夫。今できるぶんからいこ。","ちょっと遅れちゃったね。でもここから戻せるよ。"],
    pressure:["そろそろやっとこ？終わったら絶対すっきりするよ。","また延期だ〜。今日は少しだけでも触ってみよ？","何回か後回しになってるね。ひとつだけ進めよっか。"],
    gentle:["今日は無理しすぎなくていいよ。できるぶんだけで十分🧡","ひとつできたらそれで充分。今日は自分にやさしくね。","頑張れない日もあるよ。ここに来ただけでもえらい。"],
    rare:["今日も来てくれた。ちょっと待ってたかも🧡","ちゃんと頑張ってるの見てると、なんか嬉しい。","今日のあなた、ちょっと好きかも。…頑張ってるからね🧡","もう少しだけここにいてもいい？なんてね。"],
    superRare:["今日も頑張ってるの見てたら、もう少しだけそばにいたくなっちゃった。","そんなふうに頑張られたら、もっと好きになっちゃうじゃん。…なんてね🧡","今日は特別。頑張ったあなたにだけ、ちょっと近くで褒めたい。"],
    spring:["春っぽい日だね。今日は少し軽やかにいこ〜🌸","新しい季節みたいに、ひとつずつ始めよ🧡"],
    summer:["暑い日も無理せずいこ〜！水分とってね。","夏の日も、できるぶんだけで十分！"],
    autumn:["ちょっと落ち着く季節だね。今日もゆっくり進めよ。","秋っぽい空気、なんか頑張れそう🧡"],
    winter:["寒いね〜。あったかくして、無理せずいこ。","冬の日はゆっくりで大丈夫。ひとつずつね🧡"],
    rain:["雨の日はちょっとゆっくりでもいいよ。","雨でも来てくれたのえらい。今日はやさしくいこ☔"],
    tanabata:["今日は七夕だね。願いごとひとつ叶えるつもりで進めよ🎋"],
    halloween:["ハッピーハロウィン〜！今日のTODOもひとつずつ🎃"],
    christmas:["メリークリスマス🎄 今日も頑張っててえらい🧡"],
    newyear:["あけましておめでとう！今年もひとつずつ一緒にいこ🧡"],
    apr22:["今日は特別な日だね🧡 いつもよりちょっとだけ楽しくいこ！"],
    hot:["暑いから無理しないでね。水分と休憩もTODOだよ。"],
    cold:["寒い〜。あったかくしてから始めよ？"]
  };

  function ensureReactionState(){
    if(!Array.isArray(state.reactionHistory)) state.reactionHistory=[];
    if(!Array.isArray(state.rareMemories)) state.rareMemories=[];
    if(!Array.isArray(state.visualHistory)) state.visualHistory=[];
  }
  function visualKey(src){
    if(!src)return "";
    return src.startsWith("data:")?"custom:"+src.slice(-48):src.replace(/\?.*$/,"");
  }
  function chooseFreshVisual(pool){
    if(!pool.length)return null;
    ensureReactionState();
    const recent=[...recentVisuals,...state.visualHistory.slice(-8).map(x=>x.key)].slice(-10);
    let candidates=pool.filter(src=>!recent.includes(visualKey(src)));
    if(!candidates.length)candidates=pool;
    const src=candidates[Math.floor(Math.random()*candidates.length)];
    const key=visualKey(src);
    recentVisuals.push(key); if(recentVisuals.length>8)recentVisuals.shift();
    state.visualHistory.push({key,at:new Date().toISOString()});
    state.visualHistory=state.visualHistory.slice(-30);
    return src;
  }
  function daysAgo(date){
    const d=new Date((date||today())+"T00:00:00");
    return Math.floor((new Date(today()+"T00:00:00")-d)/86400000);
  }
  function pickReactionLine(category,fallback=""){
    ensureReactionState();
    const lines=REACTION_LINES[category]||REACTION_LINES.normal;
    const recent=new Set(state.reactionHistory.filter(x=>daysAgo(x.date)<=30).map(x=>x.text));
    const pool=lines.filter(x=>!recent.has(x));
    const source=pool.length?pool:lines;
    return source[Math.floor(Math.random()*source.length)]||fallback;
  }
  function stableHomeLine(category){
    const lines=REACTION_LINES[category]||REACTION_LINES.normal;
    const seed=(today()+category+Math.floor(new Date().getHours()/6)).split("").reduce((a,c)=>((a*31)+c.charCodeAt(0))>>>0,7);
    return lines[seed%lines.length];
  }
  function recordReaction(category,text,image){
    ensureReactionState();
    state.reactionHistory.push({id:uid(),category,text,image:visualKey(image),date:today(),at:new Date().toISOString()});
    state.reactionHistory=state.reactionHistory.slice(-120);
  }

  function cloudPayloadFromState(source=state){
    return {
      version:1,
      userName:source.userName||"あなた",
      theme:source.theme||"orange",
      showOshi:source.showOshi!==false,
      stealth:!!source.stealth,
      quiet:!!source.quiet,
      gentleUntil:source.gentleUntil||null,
      notifications:{...(source.notifications||{})},
      tasks:Array.isArray(source.tasks)?source.tasks:[],
      events:Array.isArray(source.events)?source.events:[],
      history:Array.isArray(source.history)?source.history:[],
      rareMemories:Array.isArray(source.rareMemories)?source.rareMemories:[]
    };
  }
  function cloudFingerprint(source=state){
    try{return JSON.stringify(cloudPayloadFromState(source));}catch{return "";}
  }
  function loadState(){
    try {
      const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
      const next={...defaultState(), ...(raw||{})};
      if(raw&&!next.cloudModifiedAt) next.cloudModifiedAt=new Date().toISOString();
      return next;
    }
    catch { return defaultState(); }
  }
  function saveState(){
    const fingerprint=cloudFingerprint(state);
    if(!cloudSyncHydrating&&fingerprint!==cloudLastFingerprint){
      cloudLastFingerprint=fingerprint;
      state.cloudModifiedAt=new Date().toISOString();
      queueCloudSync();
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if(!pushSyncInProgress) queuePushScheduleSync();
  }
  async function hashPin(pin){
    const data=new TextEncoder().encode(pin);
    const hash=await crypto.subtle.digest("SHA-256",data);
    return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  async function init(){
    $("#dateLabel").textContent = new Intl.DateTimeFormat("ja-JP",{month:"long",day:"numeric",weekday:"short"}).format(new Date());
    ensureNotificationState();
    ensureBackgroundPushState();
    cloudLastFingerprint=cloudFingerprint(state);

    // Bind controls before any storage/network work so the UI never becomes untappable.
    bind();
    applyTheme();
    renderAll();
    showLock();

    // Media storage is optional; load it after the UI is already interactive.
    loadOshiLibrary()
      .then(()=>{renderOshiLibrary();renderHome();})
      .catch(()=>{});

    if("serviceWorker" in navigator){
      try{
        const registration=await navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"});
        try{await registration.update();}catch{}
      }catch{}
    }
    startNotificationScheduler();
    refreshBackgroundPushStatus();
    queuePushScheduleSync();
    repairBackgroundPushSubscription(false);
    initCloudSync();
  }

  function bind(){
    $("#keypad").addEventListener("click", async e=>{
      const b=e.target.closest("button"); if(!b) return;
      const key=b.dataset.key;
      if(key==="clear") pinBuffer="";
      else if(key==="back") pinBuffer=pinBuffer.slice(0,-1);
      else if(pinBuffer.length<4) pinBuffer+=key;
      updatePinDots();
      if(pinBuffer.length===4) await handlePin();
    });

    $("#resetPinBtn").addEventListener("click",openGoogleRecovery);

    $$(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>switchView(btn.dataset.view)));
    $("#addBtn").addEventListener("click",openAdd);
    $("#minimalToggle").addEventListener("click",()=>{state.minimalOnly=!state.minimalOnly;saveState();renderHome();});
    $("#stealthQuick").addEventListener("click",()=>{state.stealth=!state.stealth;saveState();applyTheme();renderSettings();});

    $("#prevMonth").addEventListener("click",()=>moveMonth(-1));
    $("#nextMonth").addEventListener("click",()=>moveMonth(1));
    $("#calendarFilter").addEventListener("click",e=>{
      const b=e.target.closest("button"); if(!b) return;
      calendarFilter=b.dataset.filter;
      $$("#calendarFilter button").forEach(x=>x.classList.toggle("active",x===b));
      renderCalendarDay();
    });

    $("#addTypeTabs").addEventListener("click",e=>{
      const b=e.target.closest("button"); if(!b) return;
      addType=b.dataset.type;
      $$("#addTypeTabs button").forEach(x=>x.classList.toggle("active",x===b));
      $("#taskFields").classList.toggle("hidden",addType!=="task");
      $("#eventFields").classList.toggle("hidden",addType!=="event");
      $("#sheetTitle").textContent=addType==="task"?"TODOを追加":"予定を追加";
    });
    $("#taskDueDate").addEventListener("change",e=>{
      const date=e.target.value;
      const canBeToday=!date||date===today();
      $("#taskToday").disabled=!canBeToday;
      if(!canBeToday) $("#taskToday").checked=false;
    });
    $("#addForm").addEventListener("submit",e=>{e.preventDefault();saveNewItem();});
    $("#saveItemBtn").addEventListener("click",e=>{e.preventDefault();saveNewItem();});

    $("#todayTaskList").addEventListener("click",taskListClick);
    $("#overdueList").addEventListener("click",taskListClick);
    $("#todayEventList").addEventListener("click",taskListClick);
    $("#calendarDayContent").addEventListener("click",taskListClick);
    $("#actionClose").addEventListener("click",()=>$("#actionDialog").close());
    $("#actionDialog").addEventListener("click",e=>{
      const b=e.target.closest("[data-action]"); if(!b||!currentTaskId) return;
      handleTaskAction(currentTaskId,b.dataset.action);
    });
    $("#eventActionClose").addEventListener("click",()=>$("#eventActionDialog").close());
    $("#eventActionDialog").addEventListener("click",e=>{
      const b=e.target.closest("[data-event-action]"); if(!b||!currentEventId) return;
      handleEventAction(currentEventId,b.dataset.eventAction);
    });

    $("#userNameInput").addEventListener("change",e=>{state.userName=e.target.value.trim()||"あなた";saveState();renderAll();});
    $("#themeSelect").addEventListener("change",e=>{state.theme=e.target.value;saveState();applyTheme();});
    $("#oshiToggle").addEventListener("change",e=>{state.showOshi=e.target.checked;saveState();renderHome();});
    $("#stealthToggle").addEventListener("change",e=>{state.stealth=e.target.checked;saveState();applyTheme();renderSettings();});
    $("#quietToggle").addEventListener("change",e=>{state.quiet=e.target.checked;saveState();renderNotificationSettings();setTimeout(refreshBackgroundPushStatus,1400);});
    $("#notificationPermissionBtn").addEventListener("click",requestNotificationPermission);
    $("#notificationTestBtn").addEventListener("click",()=>sendSystemNotification("test",{}));
    $("#backgroundPushBtn").addEventListener("click",toggleBackgroundPush);
    $("#backgroundPushTestBtn")?.addEventListener("click",testBackgroundPush);
    $("#notificationEnabled").addEventListener("change",e=>{ensureNotificationState();state.notifications.enabled=e.target.checked;saveState();renderNotificationSettings();checkNotifications();setTimeout(refreshBackgroundPushStatus,1400);});
    $("#notificationStyle").addEventListener("change",saveNotificationSettingsFromUI);
    ["notificationMorningTime","notificationUnfinishedTime","notificationRecapTime","notificationEventMinutes","notificationDeadline1","notificationDeadline2",
      "notificationMorningEnabled","notificationDeadlineEnabled","notificationEventEnabled","notificationUnfinishedEnabled","notificationRecapEnabled"
    ].forEach(id=>$("#"+id)?.addEventListener("change",saveNotificationSettingsFromUI));
    $("#oshiUpload").addEventListener("change",handleOshiUpload);
    $("#oshiCategorySelect").addEventListener("change",renderOshiLibrary);
    $("#oshiClearCategory").addEventListener("click",clearSelectedOshiCategory);
    $("#oshiLibraryGrid").addEventListener("click",async e=>{
      const b=e.target.closest("[data-remove-oshi]"); if(!b) return;
      await deleteOshiImage(b.dataset.removeOshi);
    });
    $("#exportJsonBtn").addEventListener("click",exportJson);
    $("#exportCsvBtn").addEventListener("click",exportCsv);
    $("#resetDemoBtn").addEventListener("click",resetData);
    $("#cloudSyncNowBtn").addEventListener("click",()=>syncCloudNow(true));
    $("#cloudLogoutBtn").addEventListener("click",logoutCloud);
    $("#googleRecoveryClose").addEventListener("click",()=>$("#googleRecoveryDialog").close());

    const avatar=$("#oshiAvatar");
    ["pointerdown","touchstart"].forEach(evt=>avatar.addEventListener(evt,startGentlePress,{passive:true}));
    ["pointerup","pointerleave","touchend","touchcancel"].forEach(evt=>avatar.addEventListener(evt,cancelGentlePress,{passive:true}));
  }

  function showLock(){
    $("#lockScreen").classList.remove("hidden");
    $("#mainApp").classList.add("hidden");
    $("#resetPinBtn").classList.toggle("hidden",!state.pinHash);
    $("#resetPinBtn").textContent=cloudAuth.linkedUserId?"Googleでパスコードを再設定":"Google再設定（未連携）";
    $("#lockMessage").textContent = state.pinHash ? "4桁のパスコードを入力" : "最初に4桁のパスコードを決めよう";
    pinBuffer=""; updatePinDots();
  }
  function unlock(){
    $("#lockScreen").classList.add("hidden");
    $("#mainApp").classList.remove("hidden");
    renderAll();
    maybeRareMessage();
    checkNotifications();
  }
  function updatePinDots(){ $$("#pinDots i").forEach((d,i)=>d.classList.toggle("filled",i<pinBuffer.length)); }
  async function handlePin(){
    const entered=pinBuffer; pinBuffer=""; setTimeout(updatePinDots,120);
    if(pinStage==="unlock"){
      if(await hashPin(entered)===state.pinHash){ unlock(); }
      else { $("#lockMessage").textContent="ちがうみたい。もう一度！"; }
      return;
    }
    if(pinStage==="setup"){
      setupPin=entered; pinStage="confirm"; $("#lockMessage").textContent="確認でもう一度入力してね"; return;
    }
    if(pinStage==="confirm"){
      if(entered!==setupPin){ pinStage="setup"; setupPin=""; $("#lockMessage").textContent="一致しなかったよ。最初からもう一度！"; return; }
      state.pinHash=await hashPin(entered); saveState(); pinStage="unlock"; unlock();
    }
  }

  function applyTheme(){
    document.body.dataset.theme=state.theme||"orange";
    document.body.classList.toggle("stealth",!!state.stealth);
  }
  function switchView(name){
    $$(".view").forEach(v=>v.classList.remove("active"));
    $("#"+name+"View")?.classList.add("active");
    $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
    if(name==="calendar") renderCalendar();
    if(name==="history") renderHistory();
    if(name==="settings") renderSettings();
  }

  function renderAll(){ renderHome();renderCalendar();renderHistory();renderSettings(); }
  function greetingName(){
    const name=String(state.userName||"あなた").trim()||"あなた";
    if(name==="あなた") return "あなた♡";
    if(/(さん|くん|君|ちゃん|様|さま)$/.test(name)) return name+"♡";
    return name+"さん♡";
  }
  function homeGreeting(hour,{gentle=false,todayRemaining=0,overdueCount=0,completedToday=0}={}){
    const name=greetingName();
    const hasTodayActivity=completedToday+todayRemaining+overdueCount>0;
    if(gentle) return `今日はゆっくりでいいよ、${name}`;
    if(hasTodayActivity && todayRemaining===0 && overdueCount===0 && completedToday>0) return `今日もおつかれさま、${name}`;
    if((hour>=22||hour<5) && (todayRemaining>0||overdueCount>0)) return `無理しすぎないでね、${name}`;
    if(hour>=5&&hour<11) return `おはよう、${name}`;
    if(hour>=11&&hour<17) return `こんにちは、${name}`;
    if(hour>=17&&hour<22) return `こんばんは、${name}`;
    return `まだ起きてるの？${name}`;
  }
  function renderHome(){
    const hour=new Date().getHours();
    const gentle=isGentle();
    const todayTasks=state.tasks.filter(t=>!t.someday && !t.completed && (t.dueDate===today() || (!t.dueDate&&t.today)));
    const overdue=state.tasks.filter(t=>!t.completed&&!t.someday&&t.dueDate&&t.dueDate<today());
    const completedToday=state.tasks.filter(t=>t.completed&&t.completedAt?.slice(0,10)===today()).length;
    $("#greeting").textContent=homeGreeting(hour,{
      gentle,
      todayRemaining:todayTasks.length,
      overdueCount:overdue.length,
      completedToday
    });
    const denominator=completedToday+todayTasks.length+overdue.length;
    const rate=denominator?Math.round(completedToday/denominator*100):100;
    $("#todayRate").textContent=rate+"%";
    $("#todayProgressBar").style.width=rate+"%";
    $("#homeTodoCount").textContent=todayTasks.length+overdue.length;
    $("#streakCount").textContent=calcStreak()+"日";

    const homeCategory=homeOshiCategory(hour,gentle,overdue.length,rate);
    const msg = rate===100&&!gentle ? "今日ぜんぶ終わってる！ほんとにえらい〜🧡" : stableHomeLine(homeCategory);
    $("#oshiMessage").textContent=msg;
    $("#oshiPanel").classList.toggle("hidden",!state.showOshi||state.stealth);
    const homeVisual = pickOshiImage(homeCategory);
    setOshiElement($("#oshiImage"), $("#oshiFallback"), homeVisual);

    $("#minimalToggle").classList.toggle("active",state.minimalOnly);
    const filteredToday=state.minimalOnly?todayTasks.filter(t=>t.minimal):todayTasks;
    const filteredOverdue=state.minimalOnly?overdue.filter(t=>t.minimal):overdue;
    $("#overdueList").innerHTML=filteredOverdue.map(t=>taskCard(t,true)).join("");
    $("#todayTaskList").innerHTML=filteredToday.map(t=>taskCard(t,false)).join("");
    $("#emptyTasks").classList.toggle("hidden",filteredToday.length+filteredOverdue.length>0);
    const ev=state.events.filter(e=>e.date===today()).sort((a,b)=>(a.start||"99:99").localeCompare(b.start||"99:99"));
    $("#homeEventCount").textContent=ev.length;
    $("#todayEventList").innerHTML=ev.length?ev.map(eventCard).join(""):'<div class="empty-state">今日の予定はまだないよ</div>';
  }

  function taskCard(t,overdue=false){
    const due=t.dueDate ? `${fmtDate(t.dueDate)}${t.dueTime?" "+t.dueTime:""}` : "期限なし";
    return `<article class="task-card ${t.completed?"done":""} ${overdue?"overdue":""}" data-id="${t.id}">
      <button class="task-check" data-check="${t.id}">${t.completed?"✓":""}</button>
      <div class="task-main">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          <span class="badge" style="background:${t.color}20;color:${t.color}">${priorityLabel[t.priority]||"普通"}</span>
          <span class="badge gray">${esc(due)}</span>
          ${t.minimal?'<span class="badge">⭐ 最低限</span>':""}
          ${t.categories?.[0]?'<span class="badge gray">'+esc(t.categories[0])+'</span>':""}
          ${t.postponeCount?'<span class="badge red">延期 '+t.postponeCount+'回</span>':""}
        </div>
        <div class="progress-line"><i style="width:${Math.max(0,Math.min(100,t.progress||0))}%"></i></div>
      </div>
      <button class="task-more" data-more="${t.id}">⋯</button>
    </article>`;
  }
  function eventCard(e){
    return `<article class="event-card" data-event-id="${e.id}">
      <div class="event-time">${esc(e.start||"終日")}</div>
      <div class="event-bar" style="background:${e.color||"#ff8a2b"}"></div>
      <div class="event-main"><div class="event-title">${esc(e.title)}</div><div class="event-sub">${esc([e.location,e.end&&("〜"+e.end)].filter(Boolean).join(" "))}</div></div>
      <button class="event-more" type="button" data-event-more="${e.id}" aria-label="予定の操作">⋯</button>
    </article>`;
  }
  function taskListClick(e){
    const check=e.target.closest("[data-check]");
    if(check){ toggleTask(check.dataset.check); return; }
    const more=e.target.closest("[data-more]");
    if(more){ currentTaskId=more.dataset.more; $("#actionDialog").showModal(); return; }
    const eventMore=e.target.closest("[data-event-more]");
    if(eventMore){
      currentEventId=eventMore.dataset.eventMore;
      $("#eventActionDialog").showModal();
    }
  }
  function toggleTask(id){
    const t=state.tasks.find(x=>x.id===id); if(!t) return;
    t.completed=!t.completed; t.completedAt=t.completed?new Date().toISOString():null;
    if(t.completed){t.progress=100;state.history.push({id:uid(),type:"task_completed",taskId:t.id,title:t.title,date:today(),at:new Date().toISOString(),onTime:!t.dueDate||today()<=t.dueDate});}
    saveState(); renderAll();
    if(t.completed) showTaskReaction(t);
  }
  function handleTaskAction(id,action){
    const t=state.tasks.find(x=>x.id===id); if(!t)return;
    let reaction=null;
    if(action==="progress"){
      const before=Number(t.progress||0);
      const v=prompt("進捗を0〜100で入力",String(before)); if(v===null)return;
      t.progress=Math.max(0,Math.min(100,Number(v)||0));
      const crossed=[25,50,75].filter(x=>before<x&&t.progress>=x).pop();
      if(crossed) reaction={title:crossed===75?"あとちょっと！":"進んでる〜！",text:pickReactionLine("cheer"),category:"cheer"};
    }
    if(action==="postpone"){
      t.dueDate=addDays(t.dueDate||today(),1);t.today=false;t.postponeCount=(t.postponeCount||0)+1;
      state.history.push({id:uid(),type:"postponed",title:t.title,date:today(),at:new Date().toISOString()});
      const n=t.postponeCount;
      const category=isGentle()?"gentle":n>=3?"pressure":"gentle";
      const title=n>=5&&!isGentle()?"そろそろやろっか":n>=3&&!isGentle()?"また延期だ〜":"今日は切り替えよ";
      reaction={title,text:pickReactionLine(category),category};
    }
    if(action==="minimal") t.minimal=!t.minimal;
    if(action==="priority"){
      const order=["low","normal","high","urgent"]; t.priority=order[(order.indexOf(t.priority)+1)%order.length]; t.color=priorityColor[t.priority];
    }
    if(action==="someday"){t.someday=true;t.today=false;t.dueDate="";}
    if(action==="delete"){
      if(confirm("このTODOを削除する？")) state.tasks=state.tasks.filter(x=>x.id!==id);
    }
    saveState(); $("#actionDialog").close(); renderAll();
    if(reaction&&!state.quiet) showReaction(reaction.title,reaction.text,reaction.category);
  }

  function handleEventAction(id,action){
    const event=state.events.find(x=>x.id===id);
    if(!event)return;
    if(action==="delete"){
      if(!confirm(`「${event.title}」を削除する？`))return;
      state.events=state.events.filter(x=>x.id!==id);
      saveState();
      $("#eventActionDialog").close();
      currentEventId=null;
      renderAll();
      showReaction("予定を削除したよ","クラウド同期にも反映するね。","normal");
    }
  }

  function openAdd(){
    addType="task"; $$("#addTypeTabs button").forEach((b,i)=>b.classList.toggle("active",i===0));
    $("#taskFields").classList.remove("hidden");$("#eventFields").classList.add("hidden");$("#sheetTitle").textContent="TODOを追加";
    $("#taskTitle").value="";$("#taskDueDate").value=today();$("#taskDueTime").value="";$("#taskPriority").value="normal";$("#taskProgress").value=0;$("#taskColor").value="#ff8a2b";$("#taskCategory").value="";$("#taskTags").value="";$("#taskMemo").value="";$("#taskToday").checked=true;$("#taskMinimal").checked=false;
    $("#eventTitle").value="";$("#eventDate").value=today();$("#eventStart").value="";$("#eventEnd").value="";$("#eventColor").value="#ff8a2b";$("#eventLocation").value="";$("#eventAttendee").value="";$("#eventMemo").value="";
    $("#addDialog").showModal();
  }
  function saveNewItem(){
    if(addType==="task"){
      const title=$("#taskTitle").value.trim(); if(!title){showReaction("タイトルが必要だよ","ひとことだけでも入れてみてね。");return;}
      const priority=$("#taskPriority").value;
      const dueDate=$("#taskDueDate").value;
      const isTodayTask=$("#taskToday").checked && (!dueDate||dueDate===today());
      state.tasks.push({id:uid(),title,dueDate,dueTime:$("#taskDueTime").value,priority,progress:Number($("#taskProgress").value)||0,categories:$("#taskCategory").value.trim()?[ $("#taskCategory").value.trim() ]:[],tags:$("#taskTags").value.split(",").map(x=>x.trim()).filter(Boolean),color:$("#taskColor").value||priorityColor[priority],minimal:$("#taskMinimal").checked,today:isTodayTask,completed:false,completedAt:null,postponeCount:0,someday:false,createdAt:new Date().toISOString(),memo:$("#taskMemo").value.trim()});
      showReaction("追加できたね🧡",priority==="urgent"?"これ大事そう！忘れないようにしよ〜":"今日もひとつずつ進めよ！");
    } else {
      const title=$("#eventTitle").value.trim(); if(!title||!$("#eventDate").value){showReaction("予定を確認してね","タイトルと日付を入れてね。");return;}
      state.events.push({id:uid(),title,date:$("#eventDate").value,start:$("#eventStart").value,end:$("#eventEnd").value,location:$("#eventLocation").value.trim(),attendee:$("#eventAttendee").value.trim(),color:$("#eventColor").value||"#ff8a2b",memo:$("#eventMemo").value.trim()});
      showReaction("予定、入れといたよ🧡","これで忘れにくくなったね！");
    }
    saveState();$("#addDialog").close();renderAll();
  }

  function showTaskReaction(t){
    if(state.quiet)return;
    const active=state.tasks.filter(x=>!x.completed&&!x.someday&&((x.dueDate&&x.dueDate<=today())||(!x.dueDate&&x.today)));
    const minimalLeft=active.filter(x=>x.minimal).length;
    const streak=calcStreak();
    let title="やったぁ！", visualCategory="happy", text="";

    if(isGentle()){ title="ひとつできたね"; visualCategory="gentle"; text=pickReactionLine("gentle"); }
    else if(active.length===0){
      title="今日ぜんぶ終わった〜！";
      visualCategory="bigHappy";
      text=pickReactionLine("bigHappy");
    } else if(t.minimal&&minimalLeft===0){
      title="最低限クリア🧡";
      visualCategory="relief";
      text="今日の最低限、全部できたよ。ここまでで充分えらい！";
    } else if([3,7,14,30].includes(streak)){
      title=streak+"日連続！";
      visualCategory="bigHappy";
      text="続けてるのがいちばんすごい。"+streak+"日、本当にえらい🧡";
    } else if(t.dueDate){
      const diff=(new Date(t.dueDate+"T00:00:00")-new Date(today()+"T00:00:00"))/86400000;
      if(diff>=2){ visualCategory="bigHappy"; text="え、もう終わったの！？早すぎてびっくりした🧡"; }
      else if(diff===0){ visualCategory="relief"; text=pickReactionLine("relief"); }
      else if(diff<0){ visualCategory="relief"; text="遅れても、ちゃんと終わらせたのほんとにえらいよ。"; }
    }
    if(!text) text=pickReactionLine(visualCategory);
    if(t.priority==="urgent"&&visualCategory!=="gentle"){visualCategory="bigHappy";text+=" 大事なやつ終わったの、かなりすごい。";}
    showReaction(title,text,visualCategory);
  }
  function showReaction(title,text,visualCategory="normal"){
    ensureReactionState();
    const finalText=text||pickReactionLine(visualCategory);
    const image=pickOshiImage(visualCategory);
    $("#reactionTitle").textContent=title;$("#reactionText").textContent=finalText;
    setOshiElement($("#reactionImage"), $("#reactionFallback"), image);
    recordReaction(visualCategory,finalText,image);
    saveState();
    $("#reaction").classList.remove("hidden");
    clearTimeout(reactionTimer);reactionTimer=setTimeout(()=>$("#reaction").classList.add("hidden"),4200);
  }

  function startGentlePress(){
    clearTimeout(longPressTimer);
    longPressTimer=setTimeout(()=>{
      state.gentleUntil=addDays(today(),1);
      saveState();renderHome();showReaction("今日はしんどいモード","今日は優しいメッセージだけにするね。無理しなくていいよ🧡","gentle");
    },900);
  }
  function cancelGentlePress(){clearTimeout(longPressTimer);}
  function isGentle(){return !!state.gentleUntil && today()<state.gentleUntil;}

  function maybeRareMessage(){
    if(state.stealth||!state.showOshi)return;
    ensureReactionState();
    const rate=Number($("#todayRate").textContent.replace("%",""))||0;
    const hour=new Date().getHours(), streak=calcStreak();
    let rareP=.02, superP=.003;
    if(rate>=80)rareP+=.02;
    if(isGentle())rareP+=.015;
    if(hour>=22)rareP+=.015;
    if(streak>=7)rareP+=.005;
    rareP=Math.min(.08,rareP);
    if(rate===100&&streak>=7)superP+=.001;
    if(hour>=22)superP+=.0005;
    superP=Math.min(.005,superP);

    if(Math.random()<superP){
      const text=pickReactionLine("superRare");
      const image=pickOshiImage("superRare");
      state.rareMemories.push({id:uid(),text,date:today(),at:new Date().toISOString(),image:visualKey(image)});
      state.rareMemories=state.rareMemories.slice(-50);
      recordReaction("superRare",text,image);
      saveState();
      $("#reactionTitle").textContent="…ねえ🧡";$("#reactionText").textContent=text;
      setOshiElement($("#reactionImage"),$("#reactionFallback"),image);
      $("#reaction").classList.remove("hidden");
      clearTimeout(reactionTimer);reactionTimer=setTimeout(()=>$("#reaction").classList.add("hidden"),5200);
      return;
    }
    if(Math.random()<rareP) showReaction("ちょっとだけ",pickReactionLine("rare"),"rare");
  }

  function moveMonth(n){
    const d=new Date((state.calendarCursor||today())+"T00:00:00");d.setMonth(d.getMonth()+n);d.setDate(1);state.calendarCursor=iso(d);saveState();renderCalendar();
  }
  function renderCalendar(){
    const cursor=new Date((state.calendarCursor||today())+"T00:00:00");
    $("#monthLabel").textContent=new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"long"}).format(cursor);
    const y=cursor.getFullYear(),m=cursor.getMonth(),first=new Date(y,m,1),start=new Date(y,m,1-first.getDay());
    let html="";
    for(let i=0;i<42;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);const ds=iso(d);const inMonth=d.getMonth()===m;
      const items=[...state.tasks.filter(t=>t.dueDate===ds),...state.events.filter(e=>e.date===ds)];
      html+=`<button class="month-day ${inMonth?"":"muted"} ${ds===today()?"today":""} ${ds===state.selectedDate?"selected":""}" data-day="${ds}"><span class="day-num">${d.getDate()}</span><span class="dots">${items.slice(0,3).map((x,j)=>'<i class="dot" style="background:'+(x.color||["#ff8a2b","#5da8ff","#f19b62"][j%3])+'"></i>').join("")}</span></button>`;
    }
    $("#monthGrid").innerHTML=html;
    $$("#monthGrid [data-day]").forEach(b=>b.addEventListener("click",()=>{state.selectedDate=b.dataset.day;saveState();renderCalendar();}));
    renderCalendarDay();
  }
  function renderCalendarDay(){
    const ds=state.selectedDate||today();$("#selectedDayLabel").textContent=fmtDate(ds);
    const tasks=state.tasks.filter(t=>!t.someday&&(t.dueDate===ds||(!t.dueDate&&t.today&&ds===today())));
    const events=state.events.filter(e=>e.date===ds).sort((a,b)=>(a.start||"99").localeCompare(b.start||"99"));
    let html="";
    if(calendarFilter!=="task"){
      html+=`<section class="section-block"><div class="section-head"><h2>予定</h2></div><div class="event-list">${events.length?events.map(eventCard).join(""):'<div class="empty-state">予定なし</div>'}</div></section>`;
    }
    if(calendarFilter!=="event"){
      html+=`<section class="section-block"><div class="section-head"><h2>TODO</h2></div><div class="task-list">${tasks.length?tasks.map(t=>taskCard(t,false)).join(""):'<div class="empty-state">TODOなし</div>'}</div></section>`;
    }
    $("#calendarDayContent").innerHTML=html;
  }

  function renderHistory(){
    const month=today().slice(0,7);
    const done=state.history.filter(h=>h.type==="task_completed"&&h.date.startsWith(month));
    const postponed=state.history.filter(h=>h.type==="postponed"&&h.date.startsWith(month));
    const createdMonth=state.tasks.filter(t=>t.createdAt?.startsWith(month)).length;
    $("#monthDone").textContent=done.length;
    $("#monthPostponed").textContent=postponed.length;
    $("#monthRate").textContent=(createdMonth?Math.round(done.length/Math.max(createdMonth,done.length)*100):100)+"%";
    $("#onTimeRate").textContent=(done.length?Math.round(done.filter(h=>h.onTime).length/done.length*100):100)+"%";

    const bars=[];for(let i=6;i>=0;i--){const ds=addDays(today(),-i);bars.push({ds,count:state.history.filter(h=>h.type==="task_completed"&&h.date===ds).length});}
    const max=Math.max(1,...bars.map(b=>b.count));
    $("#weekBars").innerHTML=bars.map(b=>`<div class="bar-col"><div class="bar" style="height:${Math.max(4,b.count/max*100)}%"></div><span>${new Date(b.ds+"T00:00:00").getDate()}日</span></div>`).join("");

    const groups={};
    state.history.slice().reverse().forEach(h=>{(groups[h.date]??=[]).push(h);});
    const entries=Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0]));
    $("#historyList").innerHTML=entries.length?entries.map(([d,items])=>`<article class="history-card"><strong>${fmtDate(d)}</strong><p>${items.map(x=>x.type==="task_completed"?"✓ "+esc(x.title):"↷ 延期 "+esc(x.title)).join("<br>")}</p></article>`).join(""):'<div class="empty-state">まだ履歴はないよ</div>';
    const memories=(state.rareMemories||[]).slice().reverse();
    const memoryEl=$("#rareMemoryList");
    if(memoryEl) memoryEl.innerHTML=memories.length?memories.map(m=>`<article class="history-card memory-card"><strong>🧡 ${fmtDate(m.date)}</strong><p>${esc(m.text)}</p></article>`).join(""):'<div class="empty-state">超レアキュンが出ると、ここに思い出として残るよ。</div>';
  }
  function calcStreak(){
    const dates=new Set(state.history.filter(h=>h.type==="task_completed").map(h=>h.date));
    let n=0,d=today();while(dates.has(d)){n++;d=addDays(d,-1);}return n;
  }

  function openOshiDb(){
    return new Promise((resolve,reject)=>{
      if(!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
      let settled=false;
      const finish=(fn,value)=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        fn(value);
      };
      const timer=setTimeout(()=>finish(reject,new Error("IndexedDB timeout")),2500);
      let req;
      try{req=indexedDB.open(OSHI_DB,1);}catch(error){finish(reject,error);return;}
      req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(OSHI_STORE)){ const st=db.createObjectStore(OSHI_STORE,{keyPath:"id"}); st.createIndex("category","category",{unique:false}); } };
      req.onsuccess=()=>{
        if(settled){try{req.result.close();}catch{} return;}
        finish(resolve,req.result);
      };
      req.onerror=()=>finish(reject,req.error||new Error("IndexedDB error"));
      req.onblocked=()=>finish(reject,new Error("IndexedDB blocked"));
    });
  }
  async function loadOshiLibrary(){
    try{
      const db=await openOshiDb();
      const items=await new Promise((resolve,reject)=>{const tx=db.transaction(OSHI_STORE,"readonly");const req=tx.objectStore(OSHI_STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});
      oshiCache={}; items.forEach(item=>(oshiCache[item.category]??=[]).push(item)); db.close();
    }catch(e){ console.warn("Oshi library unavailable",e); oshiCache={}; }
  }
  async function putOshiImage(item){
    const db=await openOshiDb();
    await new Promise((resolve,reject)=>{const tx=db.transaction(OSHI_STORE,"readwrite");tx.objectStore(OSHI_STORE).put(item);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    db.close();
  }
  async function deleteOshiImage(id){
    const db=await openOshiDb();
    await new Promise((resolve,reject)=>{const tx=db.transaction(OSHI_STORE,"readwrite");tx.objectStore(OSHI_STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    db.close(); await loadOshiLibrary(); renderOshiLibrary(); renderHome(); showReaction("削除したよ","このカテゴリから画像を1枚外したよ。","normal");
  }
  async function clearSelectedOshiCategory(){
    const category=$("#oshiCategorySelect").value;
    const items=oshiCache[category]||[]; if(!items.length)return;
    if(!confirm("このカテゴリの画像を全部削除する？"))return;
    const db=await openOshiDb();
    await new Promise((resolve,reject)=>{const tx=db.transaction(OSHI_STORE,"readwrite");const st=tx.objectStore(OSHI_STORE);items.forEach(x=>st.delete(x.id));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    db.close(); await loadOshiLibrary(); renderOshiLibrary(); renderHome();
  }
  function compressImage(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file), img=new Image();
      img.onload=()=>{
        const max=1400, scale=Math.min(1,max/Math.max(img.width,img.height));
        const c=document.createElement("canvas"); c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale);
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg",.88));
      };
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("image"));}; img.src=url;
    });
  }
  function pickOshiImage(category="normal"){
    const preferred=(oshiCache[category]||[]).map(x=>x.dataUrl).filter(Boolean);
    if(preferred.length) return chooseFreshVisual(preferred);
    const adopted=ADOPTED_OSHI[category]||ADOPTED_OSHI.normal||[];
    if(adopted.length) return chooseFreshVisual(adopted);
    const builtins=Array.isArray(BUILTIN_OSHI[category])?BUILTIN_OSHI[category]:(BUILTIN_OSHI[category]?[BUILTIN_OSHI[category]]:[]);
    if(builtins.length) return chooseFreshVisual(builtins);
    const fallback=(oshiCache.normal||[]).map(x=>x.dataUrl).filter(Boolean);
    if(fallback.length) return chooseFreshVisual(fallback);
    const fallbackBuiltins=Array.isArray(BUILTIN_OSHI.normal)?BUILTIN_OSHI.normal:[BUILTIN_OSHI.normal].filter(Boolean);
    return state.oshiImage||chooseFreshVisual(fallbackBuiltins)||null;
  }
  function setOshiElement(imgEl,fallbackEl,src){
    if(!imgEl||!fallbackEl)return;
    imgEl.classList.toggle("hidden",!src); fallbackEl.classList.toggle("hidden",!!src);
    if(src) imgEl.src=src;
  }
  function homeOshiCategory(hour,gentle,overdueCount=0,rate=0){
    const md=today().slice(5);
    if(gentle)return "gentle";
    if(overdueCount>0)return "sad";
    if(rate===100)return "happy";
    if(md==="04-22")return "apr22";
    if(md==="07-07")return "tanabata";
    if(md==="10-31")return "halloween";
    if(md==="12-25")return "christmas";
    if(md==="01-01")return "newyear";
    if(hour<5)return "lateNight";
    if(hour<11)return "morning";
    if(hour<18)return "day";
    return "night";
  }
  function renderOshiLibrary(){
    const select=$("#oshiCategorySelect"); if(!select)return;
    const category=select.value||"normal", items=oshiCache[category]||[];
    const builtinList=Array.isArray(BUILTIN_OSHI[category])?BUILTIN_OSHI[category]:(BUILTIN_OSHI[category]?[BUILTIN_OSHI[category]]:[]);
    const adopted=ADOPTED_OSHI[category]||[];
    $("#oshiLibraryCount").textContent=`${select.options[select.selectedIndex]?.text||category}：採用${adopted.length}枚 ＋ 追加${items.length}枚`;
    const adoptedCards=adopted.map(src=>`<div class="oshi-thumb builtin-thumb"><img src="${src}" alt=""><span class="builtin-badge">採用</span></div>`).join("");
    const builtinCards=builtinList.map((src,i)=>`<div class="oshi-thumb builtin-thumb"><img src="${src}" alt=""><span class="builtin-badge">標準${i+1}</span></div>`).join("");
    const userCards=items.map(item=>`<div class="oshi-thumb"><img src="${item.dataUrl}" alt=""><button type="button" data-remove-oshi="${item.id}" aria-label="削除">×</button></div>`).join("");
    $("#oshiLibraryGrid").innerHTML=(adoptedCards+builtinCards+userCards)||'<div class="empty-state" style="grid-column:1/-1">まだ画像がないよ</div>';
  }
  function renderAdoptedCatalog(){
    const el=$("#adoptedCatalog"); if(!el)return;
    const labelMap={normal:"通常",morning:"朝",day:"昼",night:"夜",lateNight:"深夜",happy:"喜び",bigHappy:"大喜び",relief:"ほっと",cheer:"応援",sad:"しょんぼり",pressure:"ちょい圧",gentle:"しんどい",rare:"レア",superRare:"超レア",spring:"春",summer:"夏",autumn:"秋",winter:"冬",rain:"雨",tanabata:"七夕",halloween:"ハロウィン",christmas:"クリスマス",newyear:"正月",apr22:"4/22",hot:"暑い",cold:"寒い"};
    const cards=[];
    for(let i=1;i<=35;i++){
      const ext=i<=30?"jpg":"webp";
      const path=A+"v"+i+"."+ext;
      const categories=Object.entries(ADOPTED_OSHI).filter(([,arr])=>arr.some(src=>src.includes("/v"+i+"."))).map(([k])=>labelMap[k]||k);
      const ver=i<=30?"20260926-14":"20260927-04";
      cards.push(`<div class="catalog-thumb"><img src="${path}?v=${ver}" alt="v${i}"><div><strong>v${i}</strong><span>${categories.slice(0,4).join("・")||"予備"}</span></div></div>`);
    }
    el.innerHTML=cards.join("");
  }

  function loadCloudAuth(){
    try{
      return {
        linkedUserId:"",sessionToken:"",expiresAt:null,user:null,lastSyncAt:null,
        ...(JSON.parse(localStorage.getItem(AUTH_KEY)||"null")||{})
      };
    }catch{
      return {linkedUserId:"",sessionToken:"",expiresAt:null,user:null,lastSyncAt:null};
    }
  }
  function saveCloudAuth(){
    localStorage.setItem(AUTH_KEY,JSON.stringify(cloudAuth));
    renderCloudSyncStatus();
    showLockRecoveryState();
  }
  function showLockRecoveryState(){
    const btn=$("#resetPinBtn");
    if(!btn)return;
    btn.classList.toggle("hidden",!state.pinHash);
    btn.textContent=cloudAuth.linkedUserId?"Googleでパスコードを再設定":"Google再設定（未連携）";
  }
  function deviceId(){
    let id=localStorage.getItem(DEVICE_KEY)||"";
    if(!id){
      id=crypto.randomUUID?.()||("device-"+randomSecret(18));
      localStorage.setItem(DEVICE_KEY,id);
    }
    return id;
  }
  async function cloudFetch(path,options={}){
    const base=pushServerUrl();
    if(!base)throw new Error("Sync server is not configured");
    const headers={"Content-Type":"application/json",...(options.headers||{})};
    if(options.auth!==false&&cloudAuth.sessionToken)headers.Authorization="Bearer "+cloudAuth.sessionToken;
    const response=await fetch(base+path,{...options,headers,cache:"no-store"});
    let data={};
    try{data=await response.json();}catch{}
    if(!response.ok){
      if(response.status===401&&options.auth!==false){
        cloudAuth.sessionToken="";
        cloudAuth.expiresAt=null;
        localStorage.setItem(AUTH_KEY,JSON.stringify(cloudAuth));
        renderCloudSyncStatus();
      }
      throw new Error(data.error||"Cloud sync error");
    }
    return data;
  }
  function setCloudSyncText(text){
    const el=$("#cloudSyncStatus");if(el)el.textContent=text;
  }
  function renderCloudSyncStatus(){
    const badge=$("#cloudSyncBadge"),status=$("#cloudSyncStatus"),profile=$("#cloudProfile"),
      avatar=$("#cloudAvatar"),name=$("#cloudProfileName"),email=$("#cloudProfileEmail"),
      signIn=$("#googleSignInButton"),syncBtn=$("#cloudSyncNowBtn"),logoutBtn=$("#cloudLogoutBtn");
    if(!badge||!status)return;
    badge.classList.remove("connected","waiting","denied");
    const user=cloudAuth.user||null;
    if(profile)profile.classList.toggle("hidden",!user);
    if(avatar){
      avatar.classList.toggle("hidden",!user?.picture);
      if(user?.picture)avatar.src=user.picture;
    }
    if(name)name.textContent=user?.name||"Googleアカウント";
    if(email)email.textContent=user?.email||"";
    if(!googleConfig){
      badge.textContent="確認中";badge.classList.add("waiting");
      status.textContent="Googleログイン設定を確認中…";
      if(syncBtn)syncBtn.classList.add("hidden");
      if(logoutBtn)logoutBtn.classList.add("hidden");
      return;
    }
    if(!googleConfig.googleAuthReady){
      badge.textContent="設定待ち";badge.classList.add("waiting");
      status.textContent="GoogleログインのClient IDをRenderに設定すると有効になるよ。";
      if(signIn)signIn.classList.add("hidden");
      if(syncBtn)syncBtn.classList.add("hidden");
      if(logoutBtn)logoutBtn.classList.add("hidden");
      return;
    }
    if(cloudAuth.sessionToken){
      badge.textContent=cloudSyncInProgress?"同期中":"接続済み";
      badge.classList.add(cloudSyncInProgress?"waiting":"connected");
      status.textContent=cloudSyncInProgress
        ?"クラウドと同期してるよ…"
        :cloudAuth.lastSyncAt
          ?"最終同期："+new Date(cloudAuth.lastSyncAt).toLocaleString("ja-JP")
          :"Googleアカウントに接続済み。";
      if(signIn)signIn.classList.add("hidden");
      if(syncBtn)syncBtn.classList.remove("hidden");
      if(logoutBtn)logoutBtn.classList.remove("hidden");
    }else{
      badge.textContent=cloudAuth.linkedUserId?"再ログイン":"未接続";
      badge.classList.add("waiting");
      status.textContent=cloudAuth.linkedUserId
        ?"同期は停止中。Googleで再ログインすると再開するよ。"
        :"GoogleでログインするとTODO・予定・設定を別端末から復元できるよ。";
      if(signIn)signIn.classList.remove("hidden");
      if(syncBtn)syncBtn.classList.add("hidden");
      if(logoutBtn)logoutBtn.classList.add("hidden");
      if(googleIdentityReady)renderGoogleButtons();
    }
  }
  function loadGoogleIdentityScript(){
    if(window.google?.accounts?.id)return Promise.resolve();
    if(googleScriptPromise)return googleScriptPromise;
    googleScriptPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-emiruto-google]');
      if(existing){
        existing.addEventListener("load",resolve,{once:true});
        existing.addEventListener("error",reject,{once:true});
        return;
      }
      const script=document.createElement("script");
      script.src="https://accounts.google.com/gsi/client";
      script.async=true;script.defer=true;script.dataset.emirutoGoogle="1";
      script.onload=resolve;script.onerror=()=>reject(new Error("Google Identity Services failed to load"));
      document.head.appendChild(script);
    });
    return googleScriptPromise;
  }
  function renderGoogleButtons(){
    if(!googleIdentityReady||!window.google?.accounts?.id)return;
    const settingsTarget=$("#googleSignInButton");
    const recoveryTarget=$("#googleRecoveryButton");
    [settingsTarget,recoveryTarget].forEach(target=>{
      if(!target)return;
      target.innerHTML="";
      try{
        google.accounts.id.renderButton(target,{
          type:"standard",theme:"outline",size:"large",shape:"pill",
          text:"signin_with",logo_alignment:"left",width:280
        });
      }catch{}
    });
  }
  async function refreshGoogleConfig(){
    const base=pushServerUrl();
    if(!base){googleConfig={googleAuthReady:false,googleClientId:null};renderCloudSyncStatus();return;}
    try{
      googleConfig=await cloudFetch("/api/config",{method:"GET",auth:false});
      if(googleConfig.googleAuthReady&&googleConfig.googleClientId){
        await loadGoogleIdentityScript();
        google.accounts.id.initialize({
          client_id:googleConfig.googleClientId,
          callback:handleGoogleCredential,
          ux_mode:"popup",
          auto_select:false,
          cancel_on_tap_outside:true,
          itp_support:true
        });
        googleIdentityReady=true;
        renderGoogleButtons();
      }
    }catch(error){
      console.error(error);
      googleConfig={googleAuthReady:false,googleClientId:null};
    }
    renderCloudSyncStatus();
    showLockRecoveryState();
  }
  async function handleGoogleCredential(response){
    const credential=String(response?.credential||"");
    if(!credential)return;
    const recoveryOpen=!!$("#googleRecoveryDialog")?.open;
    const recoveryStatus=$("#googleRecoveryStatus");
    try{
      if(recoveryStatus&&recoveryOpen)recoveryStatus.textContent="Googleアカウントを確認中…";
      const result=await cloudFetch("/api/auth/google",{
        method:"POST",auth:false,
        body:JSON.stringify({credential})
      });
      const nextUser=result.user||{};
      if(recoveryOpen){
        if(!cloudAuth.linkedUserId||nextUser.id!==cloudAuth.linkedUserId){
          if(recoveryStatus)recoveryStatus.textContent="この端末に連携したGoogleアカウントと違うよ。";
          return;
        }
        cloudAuth={...cloudAuth,sessionToken:result.sessionToken,expiresAt:result.expiresAt,user:nextUser};
        saveCloudAuth();
        $("#googleRecoveryDialog").close();
        state.pinHash=null;
        pinStage="setup";setupPin="";pinBuffer="";
        $("#lockMessage").textContent="Google確認できたよ。新しい4桁を決めてね";
        updatePinDots();
        return;
      }
      if(cloudAuth.linkedUserId&&cloudAuth.linkedUserId!==nextUser.id){
        const ok=confirm("別のGoogleアカウントに同期先を切り替える？");
        if(!ok)return;
      }
      cloudAuth={
        linkedUserId:nextUser.id,
        sessionToken:result.sessionToken,
        expiresAt:result.expiresAt,
        user:nextUser,
        lastSyncAt:cloudAuth.lastSyncAt||null
      };
      saveCloudAuth();
      await syncCloudNow(true);
      renderGoogleButtons();
    }catch(error){
      console.error(error);
      if(recoveryStatus&&recoveryOpen)recoveryStatus.textContent="Googleログインに失敗したよ。もう一度試してね。";
      else showReaction("Googleログインできなかったよ","少し時間を置いて、もう一度試してね。","gentle");
    }
  }
  function openGoogleRecovery(){
    if(!cloudAuth.linkedUserId){
      $("#lockMessage").textContent="Google未連携だよ。PIN入力後、設定から先にGoogle連携してね";
      return;
    }
    if(!googleConfig?.googleAuthReady||!googleIdentityReady){
      $("#lockMessage").textContent="Googleログイン設定を準備中。少し待ってもう一度押してね";
      refreshGoogleConfig();
      return;
    }
    const dialog=$("#googleRecoveryDialog");
    $("#googleRecoveryStatus").textContent="連携済みのGoogleアカウントで本人確認してね。";
    dialog.showModal();
    setTimeout(renderGoogleButtons,0);
  }
  async function logoutCloud(){
    if(cloudAuth.sessionToken){
      try{await cloudFetch("/api/auth/logout",{method:"POST",body:"{}"});}catch{}
    }
    cloudAuth={...cloudAuth,sessionToken:"",expiresAt:null,lastSyncAt:null};
    saveCloudAuth();
    renderGoogleButtons();
    showReaction("同期からログアウトしたよ","端末のデータはそのまま残ってるよ。","normal");
  }
  function applyCloudPayload(data,modifiedAt){
    if(!data||typeof data!=="object")return;
    const localOnly={
      pinHash:state.pinHash,
      backgroundPush:state.backgroundPush,
      notificationLog:state.notificationLog,
      selectedDate:state.selectedDate,
      calendarCursor:state.calendarCursor,
      minimalOnly:state.minimalOnly,
      reactionHistory:state.reactionHistory,
      visualHistory:state.visualHistory,
      oshiImage:state.oshiImage
    };
    cloudSyncHydrating=true;
    state={...state,...data,...localOnly,cloudModifiedAt:modifiedAt||state.cloudModifiedAt};
    ensureNotificationState();ensureBackgroundPushState();ensureReactionState();
    cloudLastFingerprint=cloudFingerprint(state);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    cloudSyncHydrating=false;
    applyTheme();renderAll();queuePushScheduleSync();
  }
  async function syncCloudNow(showFeedback=false){
    if(!cloudAuth.sessionToken||cloudSyncInProgress||!pushServerUrl())return;
    cloudSyncInProgress=true;renderCloudSyncStatus();
    try{
      const remote=await cloudFetch("/api/sync",{method:"GET"});
      let localModified=state.cloudModifiedAt;
      if(!localModified){
        localModified=new Date().toISOString();
        state.cloudModifiedAt=localModified;
        localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      }
      const localMs=Date.parse(localModified)||0;
      const remoteMs=remote.hasData?(Date.parse(remote.modifiedAt)||0):0;
      if(remote.hasData&&remoteMs>localMs){
        applyCloudPayload(remote.data,remote.modifiedAt);
      }else if(!remote.hasData||localMs>remoteMs){
        const result=await cloudFetch("/api/sync",{
          method:"PUT",
          body:JSON.stringify({
            data:cloudPayloadFromState(state),
            modifiedAt:state.cloudModifiedAt,
            deviceId:deviceId()
          })
        });
        if(result.winner==="server"){
          applyCloudPayload(result.data,result.modifiedAt);
        }
      }else if(remote.hasData&&cloudFingerprint(state)!==JSON.stringify(remote.data)){
        applyCloudPayload(remote.data,remote.modifiedAt);
      }
      cloudAuth.lastSyncAt=new Date().toISOString();
      localStorage.setItem(AUTH_KEY,JSON.stringify(cloudAuth));
      if(showFeedback)showReaction("同期できたよ🧡","Googleアカウントに最新データを保存したよ。","happy");
    }catch(error){
      console.error(error);
      if(showFeedback)showReaction("同期できなかったよ","通信状態かGoogleログインを確認してね。","gentle");
    }finally{
      cloudSyncInProgress=false;renderCloudSyncStatus();
    }
  }
  function queueCloudSync(){
    if(!cloudAuth.sessionToken||cloudSyncHydrating)return;
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer=setTimeout(()=>syncCloudNow(false),1200);
  }
  async function initCloudSync(){
    await refreshGoogleConfig();
    if(!cloudAuth.sessionToken)return;
    try{
      const me=await cloudFetch("/api/me",{method:"GET"});
      if(me?.user){
        cloudAuth.user=me.user;
        cloudAuth.linkedUserId=cloudAuth.linkedUserId||me.user.id;
        localStorage.setItem(AUTH_KEY,JSON.stringify(cloudAuth));
      }
      await syncCloudNow(false);
    }catch(error){
      console.warn("Cloud session unavailable",error);
    }
    renderCloudSyncStatus();
  }

  function ensureBackgroundPushState(){
    state.backgroundPush={
      enabled:false,clientId:"",secret:"",lastSyncAt:null,
      ...(state.backgroundPush||{})
    };
  }
  function pushServerUrl(){
    return String(window.EMIRUTO_PUSH_SERVER||"").trim().replace(/\/+$/,"");
  }
  function supportsBackgroundPush(){
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  function isStandaloneApp(){
    return !!(window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone===true);
  }
  function isIOSLike(){
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  }
  function randomSecret(bytes=32){
    const raw=new Uint8Array(bytes);crypto.getRandomValues(raw);
    let bin="";raw.forEach(b=>bin+=String.fromCharCode(b));
    return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }
  function ensurePushCredentials(){
    ensureBackgroundPushState();
    if(!state.backgroundPush.clientId){
      state.backgroundPush.clientId=(crypto.randomUUID?.()||("emiruto-"+randomSecret(18))).replace(/[^a-zA-Z0-9_-]/g,"");
    }
    if(!state.backgroundPush.secret) state.backgroundPush.secret=randomSecret(32);
  }
  function base64UrlToUint8Array(value){
    const padding="=".repeat((4-value.length%4)%4);
    const base64=(value+padding).replace(/-/g,"+").replace(/_/g,"/");
    const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  }
  async function pushFetch(path,options={}){
    const base=pushServerUrl();
    if(!base) throw new Error("Push server is not configured");
    const response=await fetch(base+path,{
      ...options,
      headers:{"Content-Type":"application/json",...(options.headers||{})}
    });
    if(!response.ok){
      let message="Push server error";
      try{message=(await response.json()).error||message;}catch{}
      const error=new Error(message);
      error.status=response.status;
      throw error;
    }
    return response.json();
  }
  function renderBackgroundPushStatus(){
    ensureBackgroundPushState();
    const badge=$("#backgroundPushBadge"),btn=$("#backgroundPushBtn"),testBtn=$("#backgroundPushTestBtn"),status=$("#backgroundPushStatus");
    if(!badge||!btn||!status)return;
    badge.classList.remove("connected","waiting","denied");
    const server=pushServerUrl();

    if(!supportsBackgroundPush()){
      badge.textContent="非対応";badge.classList.add("denied");
      btn.disabled=true;btn.textContent="この環境では利用できません";
      if(testBtn)testBtn.disabled=true;
      status.textContent="このブラウザは標準Web Pushに対応していません。";
      return;
    }
    if(isIOSLike()&&!isStandaloneApp()){
      badge.textContent="ホーム画面待ち";badge.classList.add("waiting");
      btn.disabled=false;btn.textContent="使い方を確認";
      if(testBtn)testBtn.disabled=true;
      status.textContent="iPhone / iPadではEmiruToをホーム画面に追加し、そのアイコンから開くとバックグラウンド通知を許可できます。";
      return;
    }
    if(!server){
      badge.textContent="サーバー待ち";badge.classList.add("waiting");
      btn.disabled=true;btn.textContent="配信サーバー接続待ち";
      if(testBtn)testBtn.disabled=true;
      status.textContent="アプリ側のWeb Push対応は完了済み。配信サーバーをデプロイすると有効化できます。";
      return;
    }
    if(state.backgroundPush.enabled){
      badge.textContent="接続済み";badge.classList.add("connected");
      btn.disabled=false;btn.textContent="バックグラウンド通知を解除";
      if(testBtn)testBtn.disabled=permissionState()!=="granted";
      ensureNotificationState();
      if(!state.notifications.enabled){
        badge.textContent="通知OFF";badge.classList.remove("connected");badge.classList.add("waiting");
        status.textContent="「通知を使う」がOFFだから、実際の通知予定は登録されてないよ。";
      }else if(state.quiet){
        badge.textContent="静かに中";badge.classList.remove("connected");badge.classList.add("waiting");
        status.textContent="「今日は静かに」がONだから、今日は通知予定を登録してないよ。";
      }else{
        status.textContent=state.backgroundPush.lastSyncAt
          ?"通知予定を同期済み："+new Date(state.backgroundPush.lastSyncAt).toLocaleString("ja-JP")
          :"Pushサーバーに接続済み。通知予定を同期しています。";
      }
    }else{
      badge.textContent="利用可能";badge.classList.add("waiting");
      btn.disabled=false;btn.textContent="バックグラウンド通知を有効化";
      if(testBtn)testBtn.disabled=permissionState()!=="granted";
      status.textContent="有効化すると、EmiruToを閉じていても通知を受け取れます。";
    }
  }
  async function refreshBackgroundPushStatus(){
    renderBackgroundPushStatus();
    const server=pushServerUrl();if(!server)return;
    try{
      const r=await fetch(server+"/api/health",{cache:"no-store"});
      if(!r.ok)throw new Error("offline");

      ensureBackgroundPushState();
      if(state.backgroundPush.enabled&&state.backgroundPush.clientId&&state.backgroundPush.secret){
        try{
          const info=await pushFetch("/api/push-status",{
            method:"POST",
            body:JSON.stringify({clientId:state.backgroundPush.clientId,secret:state.backgroundPush.secret})
          });
          const status=$("#backgroundPushStatus");
          if(status&&state.notifications?.enabled&&!state.quiet){
            const next=info.nextFireAt?new Date(info.nextFireAt).toLocaleString("ja-JP"):"なし";
            status.textContent=`サーバー登録：${Number(info.pending||0)}件 ／ 次の通知：${next}`;
          }
        }catch{}
      }
    }catch{
      const badge=$("#backgroundPushBadge"),status=$("#backgroundPushStatus");
      if(badge&&!state.backgroundPush?.enabled){badge.textContent="サーバー停止中";badge.classList.add("denied");}
      if(status)status.textContent="Pushサーバーに接続できません。少し時間を置いて再試行してください。";
    }
  }
  async function registerBackgroundPushSubscription(forceNew=false){
    if(!supportsBackgroundPush()) throw new Error("Push is not supported");
    if(isIOSLike()&&!isStandaloneApp()) throw new Error("Home screen app required");
    if(permissionState()!=="granted") throw new Error("Notification permission required");

    const keyData=await pushFetch("/api/vapid-public-key",{method:"GET",headers:{}});
    const registration=await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();

    if(forceNew&&subscription){
      try{await subscription.unsubscribe();}catch{}
      subscription=null;
    }
    if(!subscription){
      subscription=await registration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:base64UrlToUint8Array(keyData.publicKey)
      });
    }

    ensurePushCredentials();
    await pushFetch("/api/subscribe",{
      method:"POST",
      body:JSON.stringify({
        clientId:state.backgroundPush.clientId,
        secret:state.backgroundPush.secret,
        subscription:subscription.toJSON()
      })
    });
    return subscription;
  }

  async function repairBackgroundPushSubscription(showFeedback=false){
    ensureBackgroundPushState();
    if(!state.backgroundPush.enabled||!pushServerUrl()||!supportsBackgroundPush())return false;
    if(isIOSLike()&&!isStandaloneApp())return false;
    if(permissionState()!=="granted")return false;

    try{
      await registerBackgroundPushSubscription(false);
      await syncBackgroundPushSchedule();
      if(showFeedback)showReaction("通知接続を修復したよ🧡","iPhoneのPush購読と通知予定をもう一度つなぎ直したよ。","happy");
      return true;
    }catch(error){
      console.warn("Background push repair failed",error);
      if(showFeedback)showReaction("通知接続を直せなかったよ","バックグラウンド通知を一度OFF→ONにしてみてね。","gentle");
      return false;
    }
  }

  async function testBackgroundPush(){
    ensureBackgroundPushState();
    if(isIOSLike()&&!isStandaloneApp()){
      showReaction("ホーム画面から開いてね","iPhoneではホーム画面に追加したEmiruToからだけバックグラウンドPushを使えるよ。","gentle");
      return;
    }
    if(permissionState()!=="granted"){
      showReaction("通知を許可してね","先にiPhone側でEmiruToの通知を許可してね。","gentle");
      return;
    }
    try{
      if(!state.backgroundPush.enabled){
        await registerBackgroundPushSubscription(false);
        state.backgroundPush.enabled=true;
        ensureNotificationState();state.notifications.enabled=true;
        localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      }else{
        await registerBackgroundPushSubscription(false);
      }
      try{
        await pushFetch("/api/test-push",{
          method:"POST",
          body:JSON.stringify({clientId:state.backgroundPush.clientId,secret:state.backgroundPush.secret})
        });
      }catch(error){
        if(error.status===404||error.status===410){
          await registerBackgroundPushSubscription(true);
          await pushFetch("/api/test-push",{
            method:"POST",
            body:JSON.stringify({clientId:state.backgroundPush.clientId,secret:state.backgroundPush.secret})
          });
        }else throw error;
      }
      renderNotificationSettings();
      if(!state.notifications?.enabled){
        showReaction("Push経路は正常だよ","ただし「通知を使う」がOFFだから、TODOや予定の通知は送られないよ。設定でONにしてね。","gentle");
      }else if(state.quiet){
        showReaction("Push経路は正常だよ","ただし「今日は静かに」がONだから、通常の通知は止まってるよ。","gentle");
      }else{
        showReaction("テストPushを送ったよ🧡","数秒以内にiPhoneの通知として出れば、バックグラウンド通知は正常だよ。","happy");
      }
      setTimeout(refreshBackgroundPushStatus,300);
    }catch(error){
      console.error(error);
      renderNotificationSettings();
      showReaction("テストPushに失敗したよ","Push購読を作り直せなかったみたい。通知設定を確認してね。","gentle");
    }
  }

  async function toggleBackgroundPush(){
    ensureBackgroundPushState();
    if(isIOSLike()&&!isStandaloneApp()){
      showReaction("ホーム画面から開いてね","iPhoneでは共有メニューの「ホーム画面に追加」でEmiruToを追加して、そのアイコンから開くと通知を有効化できるよ。","gentle");
      return;
    }
    if(state.backgroundPush.enabled) await disableBackgroundPush();
    else await enableBackgroundPush();
  }
  async function enableBackgroundPush(){
    if(!supportsBackgroundPush())return;
    if(!pushServerUrl()){renderBackgroundPushStatus();return;}
    try{
      let permission=Notification.permission;
      if(permission!=="granted") permission=await Notification.requestPermission();
      if(permission!=="granted"){renderNotificationSettings();return;}

      await registerBackgroundPushSubscription(false);
      state.backgroundPush.enabled=true;
      ensureNotificationState();state.notifications.enabled=true;
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      await syncBackgroundPushSchedule();
      renderNotificationSettings();
      showReaction("バックグラウンド通知ON🧡","EmiruToを閉じていても、設定した時間に通知できるようになったよ。","happy");
    }catch(error){
      console.error(error);
      renderBackgroundPushStatus();
      showReaction("通知の接続に失敗したよ","Push購読を作り直せなかったみたい。もう一度試してね。","gentle");
    }
  }
  async function disableBackgroundPush(){
    ensureBackgroundPushState();
    try{
      if(pushServerUrl()&&state.backgroundPush.clientId&&state.backgroundPush.secret){
        await pushFetch("/api/unsubscribe",{
          method:"POST",
          body:JSON.stringify({clientId:state.backgroundPush.clientId,secret:state.backgroundPush.secret})
        }).catch(()=>{});
      }
      const registration=await navigator.serviceWorker?.ready;
      const subscription=await registration?.pushManager?.getSubscription();
      if(subscription)await subscription.unsubscribe();
    }catch{}
    state.backgroundPush.enabled=false;state.backgroundPush.lastSyncAt=null;
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    renderNotificationSettings();
  }
  function pushDateTime(date,time){
    if(!date||!time)return null;
    const d=new Date(date+"T"+time+":00");
    return Number.isNaN(d.getTime())?null:d;
  }
  function addPushScheduleItem(items,id,fireAt,kind,data){
    if(!(fireAt instanceof Date)||Number.isNaN(fireAt.getTime()))return;
    const now=Date.now(),max=now+30*86400000;
    // Keep notification times from up to 20 minutes ago.
    // This lets a newly-created TODO inside the 15-minute reminder window
    // be delivered immediately in the background instead of being dropped.
    if(fireAt.getTime()<now-20*60000||fireAt.getTime()>max)return;
    const copy=notificationCopy(kind,data);
    items.push({
      id,fireAt:fireAt.toISOString(),title:copy.title,body:copy.body,
      tag:"emiruto-"+id,url:"https://akito0802.github.io/EmiruTo/"
    });
  }
  function pendingCountForDate(ds,offset){
    return state.tasks.filter(t=>{
      if(t.completed||t.someday)return false;
      if(t.dueDate)return t.dueDate<=ds;
      return offset===0&&t.today;
    }).length;
  }
  function buildBackgroundPushSchedule(){
    ensureNotificationState();
    const n=state.notifications,items=[];
    if(!n.enabled||state.quiet)return items;

    for(let offset=0;offset<14;offset++){
      const ds=addDays(today(),offset);
      const pending=pendingCountForDate(ds,offset);
      if(n.morningEnabled){
        addPushScheduleItem(items,"morning-"+ds,pushDateTime(ds,n.morningTime),"morning",{count:pending});
      }
      if(n.unfinishedEnabled&&pending>0){
        addPushScheduleItem(items,"unfinished-"+ds,pushDateTime(ds,n.unfinishedTime),"unfinished",{count:pending});
      }
      if(n.recapEnabled){
        const done=offset===0?state.history.filter(h=>h.type==="task_completed"&&h.date===ds).length:0;
        const tomorrowDate=addDays(ds,1);
        const tomorrow=state.tasks.filter(t=>!t.completed&&!t.someday&&t.dueDate===tomorrowDate).length;
        addPushScheduleItem(items,"recap-"+ds,pushDateTime(ds,n.recapTime),"recap",{done,tomorrow});
      }
    }

    if(n.deadlineEnabled){
      const thresholds=[Number(n.deadline1||0),Number(n.deadline2||0)].filter(x=>x>=0);
      state.tasks.filter(t=>!t.completed&&!t.someday&&t.dueDate&&t.dueTime).forEach(t=>{
        const due=pushDateTime(t.dueDate,t.dueTime);if(!due)return;
        thresholds.forEach(minutes=>{
          const fire=new Date(due.getTime()-minutes*60000);
          addPushScheduleItem(items,`deadline-${t.id}-${minutes}-${due.getTime()}`,fire,"deadline",{title:t.title,minutes});
        });
      });
    }

    if(n.eventEnabled){
      const minutes=Math.max(0,Number(n.eventMinutes||0));
      state.events.filter(e=>e.date&&e.start).forEach(e=>{
        const start=pushDateTime(e.date,e.start);if(!start)return;
        const fire=new Date(start.getTime()-minutes*60000);
        addPushScheduleItem(items,`event-${e.id}-${minutes}-${start.getTime()}`,fire,"event",{title:e.title,minutes});
      });
    }
    return items.slice(0,300);
  }
  async function syncBackgroundPushSchedule(){
    ensureBackgroundPushState();
    if(!state.backgroundPush.enabled||!pushServerUrl()||pushSyncInProgress)return;
    pushSyncInProgress=true;
    try{
      ensurePushCredentials();
      const notifications=buildBackgroundPushSchedule();
      const result=await pushFetch("/api/schedule",{
        method:"POST",
        body:JSON.stringify({
          clientId:state.backgroundPush.clientId,
          secret:state.backgroundPush.secret,
          notifications
        })
      });
      state.backgroundPush.lastSyncAt=new Date().toISOString();
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      renderBackgroundPushStatus();
      const status=$("#backgroundPushStatus");
      if(status&&state.notifications?.enabled&&!state.quiet){
        status.textContent=`サーバーへ通知予定を${Number(result.scheduled||0)}件登録したよ。`;
      }
      setTimeout(refreshBackgroundPushStatus,250);
    }catch(error){
      console.warn("Background push sync failed",error);
      if(error.status===401){
        try{
          await registerBackgroundPushSubscription(false);
          const notifications=buildBackgroundPushSchedule();
          const result=await pushFetch("/api/schedule",{
            method:"POST",
            body:JSON.stringify({
              clientId:state.backgroundPush.clientId,
              secret:state.backgroundPush.secret,
              notifications
            })
          });
          state.backgroundPush.lastSyncAt=new Date().toISOString();
          localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
          renderBackgroundPushStatus();
          const status=$("#backgroundPushStatus");
          if(status&&state.notifications?.enabled&&!state.quiet){
            status.textContent=`サーバーへ通知予定を${Number(result.scheduled||0)}件登録したよ。`;
          }
          setTimeout(refreshBackgroundPushStatus,250);
          return;
        }catch(repairError){
          console.warn("Background push resubscribe failed",repairError);
        }
      }
      const status=$("#backgroundPushStatus");
      if(status)status.textContent="通知予定の同期に失敗しました。アプリを開くと自動修復を試します。";
    }finally{
      pushSyncInProgress=false;
    }
  }
  function queuePushScheduleSync(){
    clearTimeout(pushSyncTimer);
    ensureBackgroundPushState();
    if(!state.backgroundPush.enabled)return;
    pushSyncTimer=setTimeout(syncBackgroundPushSchedule,1200);
  }

  const NOTIFICATION_DEFAULTS = {
    enabled:false,style:"emiruto",
    morningEnabled:true,morningTime:"08:00",
    deadlineEnabled:true,deadline1:60,deadline2:15,
    eventEnabled:true,eventMinutes:15,
    unfinishedEnabled:true,unfinishedTime:"21:00",
    recapEnabled:true,recapTime:"22:30"
  };
  function ensureNotificationState(){
    state.notifications={...NOTIFICATION_DEFAULTS,...(state.notifications||{})};
    if(!state.notificationLog||typeof state.notificationLog!=="object")state.notificationLog={};
  }
  function permissionState(){
    if(!("Notification" in window))return "unsupported";
    return Notification.permission||"default";
  }
  function renderNotificationSettings(){
    ensureNotificationState();
    const n=state.notifications;
    const perm=permissionState();
    const badge=$("#notificationPermissionBadge");
    if(badge){
      badge.textContent=perm==="granted"?"許可済み":perm==="denied"?"拒否":"未設定";
      badge.classList.toggle("allowed",perm==="granted");
      badge.classList.toggle("denied",perm==="denied"||perm==="unsupported");
    }
    const set=(id,val,prop="value")=>{const el=$("#"+id);if(el)el[prop]=val;};
    set("notificationEnabled",!!n.enabled,"checked");
    set("notificationStyle",n.style||"emiruto");
    set("notificationMorningTime",n.morningTime||"08:00");
    set("notificationUnfinishedTime",n.unfinishedTime||"21:00");
    set("notificationRecapTime",n.recapTime||"22:30");
    set("notificationEventMinutes",Number(n.eventMinutes??15));
    set("notificationDeadline1",Number(n.deadline1??60));
    set("notificationDeadline2",Number(n.deadline2??15));
    set("notificationMorningEnabled",!!n.morningEnabled,"checked");
    set("notificationDeadlineEnabled",!!n.deadlineEnabled,"checked");
    set("notificationEventEnabled",!!n.eventEnabled,"checked");
    set("notificationUnfinishedEnabled",!!n.unfinishedEnabled,"checked");
    set("notificationRecapEnabled",!!n.recapEnabled,"checked");
    const test=$("#notificationTestBtn"), allow=$("#notificationPermissionBtn");
    if(test)test.disabled=perm!=="granted";
    if(allow){allow.disabled=perm==="granted"||perm==="unsupported";allow.textContent=perm==="granted"?"通知は許可済み":perm==="denied"?"端末設定から通知を許可":"通知を許可する";}
    renderBackgroundPushStatus();
  }
  function saveNotificationSettingsFromUI(){
    ensureNotificationState();
    const n=state.notifications;
    n.style=$("#notificationStyle")?.value||"emiruto";
    n.morningTime=$("#notificationMorningTime")?.value||"08:00";
    n.unfinishedTime=$("#notificationUnfinishedTime")?.value||"21:00";
    n.recapTime=$("#notificationRecapTime")?.value||"22:30";
    n.eventMinutes=Math.max(0,Number($("#notificationEventMinutes")?.value||15));
    n.deadline1=Math.max(0,Number($("#notificationDeadline1")?.value||60));
    n.deadline2=Math.max(0,Number($("#notificationDeadline2")?.value||15));
    n.morningEnabled=!!$("#notificationMorningEnabled")?.checked;
    n.deadlineEnabled=!!$("#notificationDeadlineEnabled")?.checked;
    n.eventEnabled=!!$("#notificationEventEnabled")?.checked;
    n.unfinishedEnabled=!!$("#notificationUnfinishedEnabled")?.checked;
    n.recapEnabled=!!$("#notificationRecapEnabled")?.checked;
    saveState();checkNotifications();
  }
  async function requestNotificationPermission(){
    if(!("Notification" in window)){showReaction("通知に未対応","このブラウザでは通知機能を使えないみたい。","gentle");return;}
    try{
      const p=await Notification.requestPermission();
      if(p==="granted"){ensureNotificationState();state.notifications.enabled=true;saveState();renderNotificationSettings();sendSystemNotification("test",{});}
      else renderNotificationSettings();
    }catch{renderNotificationSettings();}
  }
  function hhmmNow(){
    const d=new Date();return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
  }
  function notificationKey(kind,id=""){
    return today()+"|"+kind+"|"+id;
  }
  function wasNotified(key){return !!state.notificationLog?.[key];}
  function markNotified(key){
    ensureNotificationState();state.notificationLog[key]=Date.now();
    const cutoff=Date.now()-8*86400000;
    Object.keys(state.notificationLog).forEach(k=>{if(Number(state.notificationLog[k])<cutoff)delete state.notificationLog[k];});
    saveState();
  }
  function notificationCopy(kind,data={}){
    const emiru=state.notifications?.style!=="normal";
    if(kind==="morning"){
      const c=data.count||0;
      return emiru?{title:"おはよう🧡",body:`今日のTODOは${c}件。焦らずひとつずついこ〜！`}:{title:"今日のTODO",body:`${c}件あります。`};
    }
    if(kind==="deadline"){
      return emiru?{title:"期限が近いよ🧡",body:`「${data.title}」まであと約${data.minutes}分。今のうちに少し進めよ？`}:{title:"TODOの期限が近づいています",body:`${data.title}：あと約${data.minutes}分`};
    }
    if(kind==="event"){
      return emiru?{title:"もうすぐ予定だよ🧡",body:`${data.minutes}分後に「${data.title}」。準備できた？`}:{title:"予定のリマインダー",body:`${data.title}：${data.minutes}分後`};
    }
    if(kind==="unfinished"){
      return emiru?{title:"今日まだ${data.count}件あるよ",body:"全部じゃなくていいから、ひとつだけ終わらせよ？🧡"}:{title:"未完了TODO",body:`今日の未完了が${data.count}件あります。`};
    }
    if(kind==="recap"){
      return emiru?{title:"今日もおつかれさま🧡",body:`今日は${data.done}件完了！明日のTODOは${data.tomorrow}件だよ。`}:{title:"今日の振り返り",body:`完了${data.done}件・明日${data.tomorrow}件`};
    }
    return {title:"EmiruTo",body:emiru?"通知できるようになったよ🧡":"テスト通知です。"};
  }
  async function showBrowserNotification(title,body,tag){
    if(permissionState()!=="granted")return false;
    const options={body,tag,icon:"./icon.svg",badge:"./icon.svg",data:{url:"./"}};
    try{
      const reg=await navigator.serviceWorker?.ready;
      if(reg){await reg.showNotification(title,options);return true;}
    }catch{}
    try{new Notification(title,options);return true;}catch{return false;}
  }
  async function sendSystemNotification(kind,data={},key=null){
    ensureNotificationState();
    if(kind!=="test"&&(!state.notifications.enabled||state.quiet))return false;
    if(permissionState()!=="granted"){renderNotificationSettings();return false;}
    if(key&&wasNotified(key))return false;
    const copy=notificationCopy(kind,data);
    const ok=await showBrowserNotification(copy.title,copy.body,key||("emiruto-"+kind+"-"+Date.now()));
    if(ok&&key)markNotified(key);
    return ok;
  }
  function dueDateTime(date,time){
    if(!date||!time)return null;
    const d=new Date(date+"T"+time+":00");return Number.isNaN(d.getTime())?null:d;
  }
  function checkDeadlineNotifications(now){
    const n=state.notifications;
    if(!n.deadlineEnabled)return;
    const thresholds=[Number(n.deadline1||0),Number(n.deadline2||0)].filter(x=>x>=0).sort((a,b)=>a-b);
    state.tasks.filter(t=>!t.completed&&!t.someday&&t.dueDate&&t.dueTime).forEach(t=>{
      const due=dueDateTime(t.dueDate,t.dueTime);if(!due)return;
      const diff=(due-now)/60000;if(diff<=0)return;
      const candidate=thresholds.find(x=>diff<=x);
      if(candidate===undefined)return;
      const key=notificationKey("deadline",t.id+"-"+candidate);
      if(!wasNotified(key))sendSystemNotification("deadline",{title:t.title,minutes:candidate},key);
      thresholds.filter(x=>x>candidate).forEach(x=>{const skipped=notificationKey("deadline",t.id+"-"+x);if(!wasNotified(skipped))markNotified(skipped);});
    });
  }
  function checkEventNotifications(now){
    const n=state.notifications;if(!n.eventEnabled)return;
    const mins=Math.max(0,Number(n.eventMinutes||0));
    state.events.filter(e=>e.date&&e.start).forEach(e=>{
      const dt=dueDateTime(e.date,e.start);if(!dt)return;
      const diff=(dt-now)/60000;if(diff<=0||diff>mins)return;
      const key=notificationKey("event",e.id+"-"+mins);
      if(!wasNotified(key))sendSystemNotification("event",{title:e.title,minutes:Math.max(1,Math.ceil(diff))},key);
    });
  }
  function checkNotifications(){
    ensureNotificationState();
    const n=state.notifications;
    if(!n.enabled||state.quiet||permissionState()!=="granted")return;
    const now=new Date(), current=hhmmNow();
    if(n.morningEnabled&&current>=n.morningTime){
      const count=state.tasks.filter(t=>!t.completed&&!t.someday&&(t.today||t.dueDate===today()||(t.dueDate&&t.dueDate<today()))).length;
      sendSystemNotification("morning",{count},notificationKey("morning"));
    }
    checkDeadlineNotifications(now);
    checkEventNotifications(now);
    if(n.unfinishedEnabled&&current>=n.unfinishedTime){
      const count=state.tasks.filter(t=>!t.completed&&!t.someday&&(t.today||t.dueDate===today()||(t.dueDate&&t.dueDate<today()))).length;
      if(count>0)sendSystemNotification("unfinished",{count},notificationKey("unfinished"));
    }
    if(n.recapEnabled&&current>=n.recapTime){
      const done=state.history.filter(h=>h.type==="task_completed"&&h.date===today()).length;
      const tomorrowDate=addDays(today(),1);
      const tomorrow=state.tasks.filter(t=>!t.completed&&!t.someday&&t.dueDate===tomorrowDate).length;
      sendSystemNotification("recap",{done,tomorrow},notificationKey("recap"));
    }
  }
  function startNotificationScheduler(){
    clearInterval(notificationTimer);
    checkNotifications();
    notificationTimer=setInterval(checkNotifications,30000);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkNotifications();});
    window.addEventListener("focus",checkNotifications);
  }

  function renderSettings(){
    $("#userNameInput").value=state.userName||"";
    $("#themeSelect").value=state.theme||"orange";
    $("#oshiToggle").checked=state.showOshi!==false;
    $("#stealthToggle").checked=!!state.stealth;
    $("#quietToggle").checked=!!state.quiet;
    renderOshiLibrary();
    renderAdoptedCatalog();
    renderNotificationSettings();
    renderCloudSyncStatus();
  }
  async function handleOshiUpload(e){
    const files=[...(e.target.files||[])]; if(!files.length)return;
    const category=$("#oshiCategorySelect").value||"normal";
    let added=0;
    for(const file of files){
      if(!file.type.startsWith("image/"))continue;
      try{ const dataUrl=await compressImage(file); await putOshiImage({id:uid(),category,dataUrl,createdAt:new Date().toISOString()}); added++; }catch{}
    }
    e.target.value=""; await loadOshiLibrary(); renderOshiLibrary(); renderHome();
    showReaction("画像を追加したよ🧡",`${added}枚をこのカテゴリに登録したよ。`,category);
  }
  function download(name,type,content){
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }
  function exportJson(){download("EmiruTo-backup.json","application/json",JSON.stringify(state,null,2));}
  function exportCsv(){
    const rows=[["title","dueDate","dueTime","priority","progress","completed","postponeCount"],...state.tasks.map(t=>[t.title,t.dueDate,t.dueTime,t.priority,t.progress,t.completed,t.postponeCount])];
    download("EmiruTo-tasks.csv","text/csv;charset=utf-8","\uFEFF"+rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n"));
  }
  function resetData(){
    if(!confirm("EmiruToの端末内データを初期化する？"))return;
    const oldPin=state.pinHash;state=defaultState();state.pinHash=oldPin;saveState();renderAll();showReaction("初期化したよ","デモデータに戻したよ。");
  }

  init();
})();