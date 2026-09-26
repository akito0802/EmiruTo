(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const STORAGE_KEY = "emiruto_state_v1";
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
      gentleUntil:null,oshiImage:null,selectedDate:t,calendarCursor:t,minimalOnly:false,
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
  let addType = "task";
  let pinBuffer = "";
  let pinStage = state.pinHash ? "unlock" : "setup";
  let setupPin = "";
  let longPressTimer = null;
  let reactionTimer = null;
  let calendarFilter = "all";
  let oshiCache = {};
  const OSHI_DB = "emiruto_media_v1";
  const OSHI_STORE = "oshiImages";
  const BUILTIN_OSHI = {
    normal:"./assets/oshi/normal.jpg?v=20260926-4",
    morning:"./assets/oshi/normal.jpg?v=20260926-4",
    day:"./assets/oshi/normal.jpg?v=20260926-4",
    night:"./assets/oshi/night.jpg?v=20260926-4",
    lateNight:"./assets/oshi/night.jpg?v=20260926-4",
    happy:"./assets/oshi/happy.jpg?v=20260926-4",
    bigHappy:"./assets/oshi/happy.jpg?v=20260926-4",
    relief:"./assets/oshi/happy.jpg?v=20260926-4",
    cheer:"./assets/oshi/normal.jpg?v=20260926-4",
    sad:"./assets/oshi/sad.jpg?v=20260926-4",
    pressure:"./assets/oshi/sad.jpg?v=20260926-4",
    gentle:"./assets/oshi/sad.jpg?v=20260926-4",
    rare:"./assets/oshi/rare.jpg?v=20260926-4",
    superRare:"./assets/oshi/rare.jpg?v=20260926-4",
    spring:"./assets/oshi/normal.jpg?v=20260926-4",
    summer:"./assets/oshi/normal.jpg?v=20260926-4",
    autumn:"./assets/oshi/normal.jpg?v=20260926-4",
    winter:"./assets/oshi/night.jpg?v=20260926-4",
    rain:"./assets/oshi/night.jpg?v=20260926-4",
    tanabata:"./assets/oshi/normal.jpg?v=20260926-4",
    halloween:"./assets/oshi/normal.jpg?v=20260926-4",
    christmas:"./assets/oshi/happy.jpg?v=20260926-4",
    newyear:"./assets/oshi/happy.jpg?v=20260926-4",
    apr22:"./assets/oshi/happy.jpg?v=20260926-4",
    hot:"./assets/oshi/normal.jpg?v=20260926-4",
    cold:"./assets/oshi/night.jpg?v=20260926-4"
  };

  function loadState(){
    try { return {...defaultState(), ...(JSON.parse(localStorage.getItem(STORAGE_KEY)||"null")||{})}; }
    catch { return defaultState(); }
  }
  function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  async function hashPin(pin){
    const data=new TextEncoder().encode(pin);
    const hash=await crypto.subtle.digest("SHA-256",data);
    return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  async function init(){
    $("#dateLabel").textContent = new Intl.DateTimeFormat("ja-JP",{month:"long",day:"numeric",weekday:"short"}).format(new Date());
    await loadOshiLibrary();
    bind();
    applyTheme();
    renderAll();
    showLock();
    if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
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

    $("#resetPinBtn").addEventListener("click",()=>showReaction("Google連携はまだ未接続","今は端末内の初期化から再設定してね。"));

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
    $("#addForm").addEventListener("submit",e=>{e.preventDefault();saveNewItem();});
    $("#saveItemBtn").addEventListener("click",e=>{e.preventDefault();saveNewItem();});

    $("#todayTaskList").addEventListener("click",taskListClick);
    $("#overdueList").addEventListener("click",taskListClick);
    $("#actionClose").addEventListener("click",()=>$("#actionDialog").close());
    $("#actionDialog").addEventListener("click",e=>{
      const b=e.target.closest("[data-action]"); if(!b||!currentTaskId) return;
      handleTaskAction(currentTaskId,b.dataset.action);
    });

    $("#userNameInput").addEventListener("change",e=>{state.userName=e.target.value.trim()||"あなた";saveState();renderAll();});
    $("#themeSelect").addEventListener("change",e=>{state.theme=e.target.value;saveState();applyTheme();});
    $("#oshiToggle").addEventListener("change",e=>{state.showOshi=e.target.checked;saveState();renderHome();});
    $("#stealthToggle").addEventListener("change",e=>{state.stealth=e.target.checked;saveState();applyTheme();renderSettings();});
    $("#quietToggle").addEventListener("change",e=>{state.quiet=e.target.checked;saveState();});
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

    const avatar=$("#oshiAvatar");
    ["pointerdown","touchstart"].forEach(evt=>avatar.addEventListener(evt,startGentlePress,{passive:true}));
    ["pointerup","pointerleave","touchend","touchcancel"].forEach(evt=>avatar.addEventListener(evt,cancelGentlePress,{passive:true}));
  }

  function showLock(){
    $("#lockScreen").classList.remove("hidden");
    $("#mainApp").classList.add("hidden");
    $("#resetPinBtn").classList.toggle("hidden",!state.pinHash);
    $("#lockMessage").textContent = state.pinHash ? "4桁のパスコードを入力" : "最初に4桁のパスコードを決めよう";
    pinBuffer=""; updatePinDots();
  }
  function unlock(){
    $("#lockScreen").classList.add("hidden");
    $("#mainApp").classList.remove("hidden");
    renderAll();
    maybeRareMessage();
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
  function renderHome(){
    const hour=new Date().getHours();
    const hello=hour<11?"おはよう":hour<18?"こんにちは":"おかえり";
    $("#greeting").textContent=`${hello}、${state.userName||"あなた"}`;
    const gentle=isGentle();
    const todayTasks=state.tasks.filter(t=>!t.someday && (t.today||t.dueDate===today()) && !t.completed);
    const overdue=state.tasks.filter(t=>!t.completed&&!t.someday&&t.dueDate&&t.dueDate<today());
    const completedToday=state.tasks.filter(t=>t.completed&&t.completedAt?.slice(0,10)===today()).length;
    const denominator=completedToday+todayTasks.length+overdue.length;
    const rate=denominator?Math.round(completedToday/denominator*100):100;
    $("#todayRate").textContent=rate+"%";
    $("#streakCount").textContent=calcStreak()+"日";

    const msg = gentle ? "今日は無理しすぎなくていいよ。できるぶんだけで十分🧡" :
      rate===100 ? "今日ぜんぶ終わってる！ほんとにえらい〜🧡" :
      overdue.length ? "残ってるのあるね…でも今からひとつだけでも一緒にやろ？" :
      hour>=22 ? "こんな時間までおつかれさま。あと少しだけね🧡" :
      "今日もひとつずついこ〜！";
    $("#oshiMessage").textContent=msg;
    $("#oshiPanel").classList.toggle("hidden",!state.showOshi||state.stealth);
    const homeVisual = pickOshiImage(homeOshiCategory(hour,gentle,overdue.length,rate));
    setOshiElement($("#oshiImage"), $("#oshiFallback"), homeVisual);

    $("#minimalToggle").classList.toggle("active",state.minimalOnly);
    const filteredToday=state.minimalOnly?todayTasks.filter(t=>t.minimal):todayTasks;
    const filteredOverdue=state.minimalOnly?overdue.filter(t=>t.minimal):overdue;
    $("#overdueList").innerHTML=filteredOverdue.map(t=>taskCard(t,true)).join("");
    $("#todayTaskList").innerHTML=filteredToday.map(t=>taskCard(t,false)).join("");
    $("#emptyTasks").classList.toggle("hidden",filteredToday.length+filteredOverdue.length>0);
    const ev=state.events.filter(e=>e.date===today()).sort((a,b)=>(a.start||"99:99").localeCompare(b.start||"99:99"));
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
    return `<article class="event-card">
      <div class="event-time">${esc(e.start||"終日")}</div>
      <div class="event-bar" style="background:${e.color||"#ff8a2b"}"></div>
      <div><div class="event-title">${esc(e.title)}</div><div class="event-sub">${esc([e.location,e.end&&("〜"+e.end)].filter(Boolean).join(" "))}</div></div>
    </article>`;
  }
  function taskListClick(e){
    const check=e.target.closest("[data-check]");
    if(check){ toggleTask(check.dataset.check); return; }
    const more=e.target.closest("[data-more]");
    if(more){ currentTaskId=more.dataset.more; $("#actionDialog").showModal(); }
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
    if(action==="progress"){
      const v=prompt("進捗を0〜100で入力",String(t.progress||0)); if(v===null)return;
      t.progress=Math.max(0,Math.min(100,Number(v)||0));
    }
    if(action==="postpone"){ t.dueDate=addDays(t.dueDate||today(),1);t.today=false;t.postponeCount=(t.postponeCount||0)+1;state.history.push({id:uid(),type:"postponed",title:t.title,date:today(),at:new Date().toISOString()}); }
    if(action==="minimal") t.minimal=!t.minimal;
    if(action==="priority"){
      const order=["low","normal","high","urgent"]; t.priority=order[(order.indexOf(t.priority)+1)%order.length]; t.color=priorityColor[t.priority];
    }
    if(action==="someday"){t.someday=true;t.today=false;t.dueDate="";}
    if(action==="delete"){
      if(confirm("このTODOを削除する？")) state.tasks=state.tasks.filter(x=>x.id!==id);
    }
    saveState(); $("#actionDialog").close(); renderAll();
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
      state.tasks.push({id:uid(),title,dueDate:$("#taskDueDate").value,dueTime:$("#taskDueTime").value,priority,progress:Number($("#taskProgress").value)||0,categories:$("#taskCategory").value.trim()?[ $("#taskCategory").value.trim() ]:[],tags:$("#taskTags").value.split(",").map(x=>x.trim()).filter(Boolean),color:$("#taskColor").value||priorityColor[priority],minimal:$("#taskMinimal").checked,today:$("#taskToday").checked,completed:false,completedAt:null,postponeCount:0,someday:false,createdAt:new Date().toISOString(),memo:$("#taskMemo").value.trim()});
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
    let text="ちゃんと終わらせたのえらい〜！";
    let visualCategory="happy";
    if(isGentle()){ text="ひとつ終わったね。今日はそれだけでも十分すごいよ🧡"; visualCategory="gentle"; }
    else if(t.dueDate){
      const diff=(new Date(t.dueDate+"T00:00:00")-new Date(today()+"T00:00:00"))/86400000;
      if(diff>=2){ text="え、もう終わったの！？早すぎてびっくりした🧡"; visualCategory="bigHappy"; }
      else if(diff===0){ text="間に合った〜！ちゃんとやり切ったのえらい！"; visualCategory="relief"; }
      else if(diff<0){ text="遅れても、ちゃんと終わらせたのほんとにえらいよ。"; visualCategory="relief"; }
    }
    if(t.priority==="urgent"){ text+=" 大事なやつ終わったの、かなりすごい。"; visualCategory="bigHappy"; }
    showReaction("やったぁ！",text,visualCategory);
  }
  function showReaction(title,text,visualCategory="normal"){
    $("#reactionTitle").textContent=title;$("#reactionText").textContent=text;
    setOshiElement($("#reactionImage"), $("#reactionFallback"), pickOshiImage(visualCategory));
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
    let p=.012;
    const rate=Number($("#todayRate").textContent.replace("%",""))||0;
    if(rate>=80)p+=.025;if(isGentle())p+=.025;if(new Date().getHours()>=22)p+=.015;
    if(Math.random()<p){
      const superRare=Math.random()<.12;
      const messages=superRare?[
        "今日も頑張ってるの見てたら、もう少しだけそばにいたくなっちゃった。",
        "そんなふうに頑張られたら、もっと好きになっちゃうじゃん。…なんてね🧡"
      ]:[
        "ちゃんと頑張ってるの、見てるとなんか嬉しい。",
        "今日も来てくれた。ちょっと待ってたかも🧡"
      ];
      const text=messages[Math.floor(Math.random()*messages.length)];
      if(superRare&&!state.rareMemories.some(x=>x.text===text)){state.rareMemories.push({id:uid(),text,date:today()});saveState();}
      showReaction(superRare?"…ねえ🧡":"ちょっとだけ",text,superRare?"superRare":"rare");
    }
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
    const tasks=state.tasks.filter(t=>!t.someday&&(t.dueDate===ds||t.today&&ds===today()));
    const events=state.events.filter(e=>e.date===ds).sort((a,b)=>(a.start||"99").localeCompare(b.start||"99"));
    let html="";
    if(calendarFilter!=="task"){
      html+=`<section class="section-block"><div class="section-head"><h2>予定</h2></div><div class="event-list">${events.length?events.map(eventCard).join(""):'<div class="empty-state">予定なし</div>'}</div></section>`;
    }
    if(calendarFilter!=="event"){
      html+=`<section class="section-block"><div class="section-head"><h2>TODO</h2></div><div class="task-list">${tasks.length?tasks.map(t=>taskCard(t,false)).join(""):'<div class="empty-state">TODOなし</div>'}</div></section>`;
    }
    $("#calendarDayContent").innerHTML=html;
    $("#calendarDayContent").addEventListener("click",taskListClick,{once:true});
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
  }
  function calcStreak(){
    const dates=new Set(state.history.filter(h=>h.type==="task_completed").map(h=>h.date));
    let n=0,d=today();while(dates.has(d)){n++;d=addDays(d,-1);}return n;
  }

  function openOshiDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(OSHI_DB,1);
      req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(OSHI_STORE)){ const st=db.createObjectStore(OSHI_STORE,{keyPath:"id"}); st.createIndex("category","category",{unique:false}); } };
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
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
    const preferred=oshiCache[category]||[];
    if(preferred.length) return preferred[Math.floor(Math.random()*preferred.length)].dataUrl;
    if(BUILTIN_OSHI[category]) return BUILTIN_OSHI[category];
    const fallback=oshiCache.normal||[];
    if(fallback.length) return fallback[Math.floor(Math.random()*fallback.length)].dataUrl;
    return state.oshiImage||BUILTIN_OSHI.normal||null;
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
    const builtin=BUILTIN_OSHI[category]||null;
    $("#oshiLibraryCount").textContent=`${select.options[select.selectedIndex]?.text||category}：追加${items.length}枚${builtin?" ＋ 標準画像":""}`;
    const builtinCard=builtin?`<div class="oshi-thumb builtin-thumb"><img src="${builtin}" alt=""><span class="builtin-badge">標準</span></div>`:"";
    const userCards=items.map(item=>`<div class="oshi-thumb"><img src="${item.dataUrl}" alt=""><button type="button" data-remove-oshi="${item.id}" aria-label="削除">×</button></div>`).join("");
    $("#oshiLibraryGrid").innerHTML=(builtinCard+userCards)||'<div class="empty-state" style="grid-column:1/-1">まだ画像がないよ</div>';
  }
  function renderSettings(){
    $("#userNameInput").value=state.userName||"";
    $("#themeSelect").value=state.theme||"orange";
    $("#oshiToggle").checked=state.showOshi!==false;
    $("#stealthToggle").checked=!!state.stealth;
    $("#quietToggle").checked=!!state.quiet;
    renderOshiLibrary();
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