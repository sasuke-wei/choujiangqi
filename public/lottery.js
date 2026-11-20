import { qrPath } from "./qr.js";

const params=new URLSearchParams(location.search), id=params.get("event"), mode=params.get("view")||"host";
const app=document.querySelector("#app"), dialog=document.querySelector("#dialog");
function saved(){try{return JSON.parse(localStorage.getItem("press-events")||"{}");}catch{return {};}}
const key=id&&saved()[id]?.key;
const campus='<svg class="campus" viewBox="0 0 620 242" aria-hidden="true" focusable="false"><use href="#south-lake"/></svg>';
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const link=(view,event=id)=>"/lottery.html?"+new URLSearchParams({event,view});
const listUrl="/lottery.html?view=activities";
const canOperate=Boolean(key && mode==="host");
const button=(action,label,cls="",extra="")=>`<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;

const num=n=>String(n).padStart(2,"0");
const brand=document.querySelector(".brand");
brand.href=id ? link(mode) : listUrl;
document.querySelector(".bar").hidden=!id;
document.querySelector("#context").textContent=mode==="join"?"学生报名":"现场抽奖";
let state,busy=false,timer,activeForm,sequence=0;
function toast(msg){
  const box=document.querySelector("#notice");box.textContent=msg;box.hidden=false;clearTimeout(timer);
  timer=setTimeout(()=>box.hidden=true,5000);
}
async function api(body){
  const options={cache:"no-store"};
  const authenticated=canOperate||(!body&&mode==="screen"&&key);
  const headers=authenticated?{Authorization:"Bearer "+key}:{};
  if(body)Object.assign(options,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(body)});
  else options.headers=headers;
  const res=await fetch("/api/lottery"+(id?"?id="+encodeURIComponent(id):""),options).catch(()=>{throw Error("连接中断，请重试。");});
  const data=await res.json();
  if(!res.ok)throw Error(data.error||"暂时无法完成操作。");
  return data;
}
function hero(label,title,desc,actions=""){
  return `<section class="poster"><div class="poster-copy"><p class="eyebrow">${esc(label)}</p><h2>${esc(title)}</h2><p class="poster-description">${esc(desc)}</p>${actions?`<div class="actions">${actions}</div>`:""}</div>${campus}</section>`;
}
function agenda(rounds,current,edit){
  return `<section class="agenda"><div class="section-head"><h2>奖项安排</h2><small>${rounds.length} 轮</small></div>${rounds.map((r,i)=>`<div class="round ${i===current?"on":""}"><span class="roundtag" aria-label="第 ${i+1} 轮">${num(i+1)}</span><div><strong>${esc(r.prize)}</strong><small>${i<current?"已开奖":i===current?"下一轮":"待开奖"}</small></div><div class="right">${r.quota} 人 ${edit&&i>=current?button("edit","调整","navlink",`data-i="${i}" aria-label="调整第 ${i+1} 轮"`):""}</div></div>`).join("")}</section>`;
}
function home(){
  app.innerHTML=`<section class="start"><h1>现场抽奖</h1>${button("setup","配置新活动","primary")}</section>`;
}
function modal(title,content,fn,label="确认"){
  activeForm=fn;document.querySelector("#dialogBody").innerHTML=`<form id="modalForm" class="form stack"><h2 id="dialogTitle">${esc(title)}</h2>${content}<p class="error" role="alert"></p><div class="actions"><button class="primary" type="submit">${esc(label)}</button>${button("cancel","取消")}</div></form>`;
  dialog.showModal();
}
async function create(title,rounds){
  const result=await api({action:"create",title,rounds});
  localStorage.setItem("press-events",JSON.stringify({...saved(),[result.id]:{title,key:result.key}}));
  location.assign(link("host",result.id));
}
function fields(number){
  return `<fieldset class="round-config"><legend>第 ${number} 轮</legend><div class="rowform">
    <label>奖品<input required maxlength="32" name="prize"></label>
    <label>人数<input required type="number" inputmode="numeric" name="quota" min="1" max="500" value="1"></label>
    ${button("remove","移除")}</div></fieldset>`;
}
function setup(){
  const entries=Object.entries(saved()).filter(([,activity])=>activity.key&&!activity.demo).reverse();
  const previous=entries.length?`<details class="saved-activities"><summary>已有活动</summary><ul>${entries.map(([event,activity])=>`<li><a href="${esc(link("host",event))}">${esc(activity.title)}</a></li>`).join("")}</ul></details>`:"";
  modal("配置新活动",`<label>活动名称<input name="title" maxlength="48" required></label><div class="stack" id="fields">${[1,2,3,4].map(fields).join("")}</div>${button("add","添加一轮")}${previous}`,async f=>{
    const rounds=[...f.querySelectorAll(".rowform")].map(row=>({prize:row.querySelector("[name=prize]").value,quota:Number(row.querySelector("[name=quota]").value)}));
    await create(f.elements.title.value,rounds);
  },"创建活动");
}

function results(r,control=false,showAbsent=control){
  const empty=r.quota-r.wins.filter(w=>!w.absent).length;
  return `<div class="summary">${r.wins.filter(w=>showAbsent||!w.absent).map(w=>`<div class="winner ${w.absent?"absent":""}"><strong>${esc(w.name)}</strong><small>学号尾号 ${esc(w.suffix)}${w.absent?" · 已缺席":""}</small>${control&&!w.absent?button("replace","缺席并补抽","navlink",`data-person="${w.id}"`):""}</div>`).join("")}</div>${empty?`<p class="ruleline">本轮候选人已抽完，${empty} 个名额空缺。</p>`:""}`;
}
let qrMarkup;
function qrBox(){
  if(state.current===state.rounds.length)return `<div class="qrbox"><h2>报名已截止</h2></div>`;
  if(!qrMarkup){
    const joinPath=link("join");
    const {size,path}=qrPath(new URL(joinPath,location.href).href);
    qrMarkup=`<a class="qr" href="${esc(joinPath)}" target="_blank" rel="noopener" aria-label="打开本场报名页"><svg role="img" aria-label="本场报名二维码" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="currentColor"/></svg></a>`;
  }
  return `<div class="qrbox"><h2>扫码报名</h2>${qrMarkup}</div>`;
}
function roundAction(){
  const next=state.rounds[state.current];
  if(next)return button("draw",`抽取第 ${state.current+1} 轮 · ${esc(next.prize)} · ${next.quota} 人`,"light");
  return state.closed?"":button("close","结束本场活动","light");
}
let revealTimer;
function edition(round) {
  const total = state.rounds.length;
  return `第 ${round} 轮 / 共 ${total} 轮`;
}
function setupAndHistory() {
  const opened = app.querySelector("#event-tools")?.open ? "open" : "";
  const past = state.rounds.slice(0,state.current);
  const history = past.map((r,i)=>{
    const open = app.querySelector(`[data-record="${i}"]`)?.open ? "open" : "";
    return `<details data-record="${i}" ${open}><summary>第 ${i+1} 轮 · ${esc(r.prize)}</summary>${results(r,false,true)}</details>`;
  }).join("");
  return `<details class="panel event-tools" id="event-tools" ${opened}>
    <summary>奖项与开奖记录</summary><div class="tools-grid">${agenda(state.rounds,state.current,canOperate)}
    <div class="panel history"><div class="panelhead"><h2>开奖记录</h2></div>${history||'<p class="empty">首轮开奖后显示记录。</p>'}</div></div>
    ${canOperate?`<a class="button" href="${listUrl}">返回首页</a>`:""}</details>`;
}
function animationPanel(round) {
  const label = state.reveal.kind==="replace"?"本轮补抽":"本轮开奖";
  const elapsed = Math.max(0,state.reveal.durationMs-state.reveal.remainingMs);
  return `<section class="press-run" style="--offset:-${elapsed}ms" aria-label="${label}正在揭晓">
    <div class="press-mast"><strong>${label}</strong><span>${edition(state.current)}</span></div>
    <div class="names-scene">
      <h2 class="reel-prize">${esc(round.prize)}</h2>
      <div class="names-window" aria-hidden="true"><div class="name-track">
        <div class="rolling-name"></div><div class="rolling-name featured"></div><div class="rolling-name"></div>
      </div></div>
      <p class="reel-status" role="status">即将揭晓</p>
    </div>
    <div class="lake-progress" aria-hidden="true"><i></i><svg viewBox="0 0 620 242" focusable="false"><use href="#south-lake"/></svg></div>
  </section>`;
}
function runRevealClock(reveal) {
  const names = [...(reveal.names ?? [])];
  // Shuffle the display order independently of the server's draw.
  for (let i=names.length-1; i>0; i--) {
    const j=Math.floor(Math.random()*(i+1));
    [names[i],names[j]]=[names[j],names[i]];
  }
  const track=app.querySelector(".name-track");
  const status=app.querySelector(".reel-status");
  const columns=Math.max(1,Math.min(4,Math.ceil(names.length/45)));
  const rowCount=Math.ceil(names.length/columns);
  const advance=Math.max(1,Math.min(3,Math.ceil(rowCount/50)));
  track.dataset.lanes=String(columns);
  track.style.setProperty("--lanes",String(columns));
  const rows=Array.from(track.children,row=>
    Array.from({length:columns},()=>row.appendChild(document.createElement("span")))
  );
  const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)").matches;
  const end=performance.now()+reveal.remainingMs;
  let index=0;
  function tick() {
    const left=end-performance.now();
    if (left<=0) {
      status.textContent="正在揭晓";
      refresh(true);
      return;
    }
    const progress=1-left/reveal.durationMs;
    const easing=Math.max(0,(progress-0.62)/0.38);
    const stepMs=(reducedMotion||rowCount<=1)?650:80+Math.round(315*easing*easing);
    const message=left<=1800?"即将揭晓":rowCount>1?"候选人姓名滚动中":names.length?"本轮候选人":"等待揭晓";
    if (status.textContent!==message) status.textContent=message;
    for (const [row,cells] of rows.entries()) {
      const group=rowCount?(index+row-1+rowCount)%rowCount:0;
      const visible=row===1 || (row===0 && rowCount>=3) || (row===2 && rowCount>=2);
      for (const [column,cell] of cells.entries()) {
        cell.textContent=visible?(names[group*columns+column]??""):"";
      }
    }
    if (!names.length) rows[1][0].textContent="即将揭晓";
    if (!reducedMotion && rowCount>1 && track.animate) {
      const travel=easing>0.4?"4%":"8%";
      track.animate([{transform:`translateY(${travel})`},{transform:"translateY(0)"}],
        {duration:Math.min(stepMs*.72,205),easing:"cubic-bezier(.2,.65,.25,1)"});
    }
    index+=advance;
    revealTimer=setTimeout(tick,Math.min(left,stepMs));
  }
  tick();
}
function stage(){
  const round=state.rounds[state.current-1];
  const next=state.rounds[state.current];
  const actions=canOperate?roundAction():"";
  const fullscreen=document.fullscreenEnabled?button("fullscreen",document.fullscreenElement?"退出全屏":"全屏显示","light"):"";
  let board;
  if(state.reveal){
    board=animationPanel(round);
  }else if(round){
    board=`<article class="bulletin"><div class="press-mast"><strong>中奖名单</strong><span>${edition(state.current)}</span></div>
      <div class="bulletin-head"><h2>${esc(round.prize)}</h2>${state.closed?"<span>活动已结束</span>":""}</div>
      ${results(round,canOperate&&!state.closed,false)}
      ${actions?`<div class="desk-action">${actions}</div>`:""}</article>`;
  }else{
    board=hero(`即将开奖  /  ${edition(1)}`,next.prize,`本轮抽取 ${next.quota} 人`,actions);
  }
  const tools=state.reveal?"":setupAndHistory();
  app.innerHTML=`<div class="heading"><div><h1>${esc(state.title)}</h1><p class="event-meta">已报名 <b id="attendance">${state.count}</b> 人 · ${state.closed?"活动已结束":next?"报名进行中":"报名已截止"}</p></div>${fullscreen}</div>
    <div class="stagegrid"><div class="broadcast">${board}</div>${qrBox()}</div>${tools}`;
  if(state.reveal)runRevealClock(state.reveal);
}
function renderActivity(){
  clearTimeout(revealTimer);
  document.body.classList.toggle("stage",mode!=="join");
  if(mode==="join")join();else stage();
}
const signupFields = `<label>姓名<input name="name" required maxlength="40" autocomplete="name" placeholder="请输入完整姓名"></label><label>学号<input name="student" required minlength="4" maxlength="32" spellcheck="false" placeholder="请输入学号，保留开头的 0"></label><p class="helper">同一学号限报一次。开奖时大屏会滚动显示姓名，中奖后显示姓名和学号后四位。</p>`;
function join(){
  const stopped=state.current===state.rounds.length;
  app.innerHTML=`<div class="entry">${hero("活动报名",state.title,stopped?"本场报名已结束":`现在报名可参加第 ${state.current+1} 轮及后续抽奖`)}<form id="joinForm" class="form panel below stack"><h2>${stopped?"报名已截止":"填写报名信息"}</h2>${stopped?"":`${signupFields}<button class="primary" type="submit">确认报名</button>`}<p class="error" role="alert"></p></form></div>`;
}
async function refresh(force=false){
  const n=++sequence;
  try{
    const next=await api();if(n!==sequence)return;
    const changed=force||!state||next.revision!==state.revision||Boolean(next.reveal)!==Boolean(state.reveal);
    const attendance=document.querySelector("#attendance");
    if(attendance)attendance.textContent=String(next.count);
    state=next;
    if(changed)renderActivity();
  }catch(error){
    if(!state)app.innerHTML=`<div class="compact stack"><h1>活动暂时无法打开</h1><p>${esc(error.message)}</p><div class="actions">${button("retry","重新连接")}<a class="button" href="${listUrl}">返回首页</a></div></div>`;
    else toast(error.message);
  }
}
async function change(data,revision){try{await api({...data,revision});}finally{await refresh(true);}}
function confirmAction(el){
  const revision=state.revision, action=el.dataset.action;
  const current=state.rounds[state.current-1];
  if(action==="replace"){
    const person=Number(el.dataset.person), w=current.wins.find(p=>p.id===person);
    modal("确认缺席并补抽",`<p>${esc(w.name)}（尾号 ${esc(w.suffix)}）将退出本场后续抽奖。系统从本轮原候选名单补抽 1 人。若名单已抽完，此名额留空。</p>`,()=>change({action,person},revision),"确认缺席并补抽");
  }
  if(action==="close")modal("结束本场活动","<p>请确认最后一轮同学均已到场。结束后，本场中奖名单将确定。</p>",()=>change({action},revision),"确认结束");
  if(action==="edit"){
    const index=Number(el.dataset.i),r=state.rounds[index];
    modal(`调整第 ${index+1} 轮`,`<label>奖品<input name="prize" required maxlength="32" value="${esc(r.prize)}"></label><label>人数<input name="quota" required type="number" min="1" max="500" value="${r.quota}"></label>`,f=>change({action:"configure",index,round:{prize:f.elements.prize.value,quota:Number(f.elements.quota.value)}},revision),"保存奖项");
  }
}
document.addEventListener("click",async e=>{
  const el=e.target.closest("[data-action]");if(busy||!el)return;
  const action=el.dataset.action;
  try{
    if(action==="setup")setup();
    else if(action==="cancel")dialog.close();
    else if(action==="add"){
      const area=document.querySelector("#fields");
      if(area.children.length>=20)return toast("最多可设置 20 轮。");
      area.insertAdjacentHTML("beforeend",fields(area.children.length+1));
    }else if(action==="remove"){
      const area=document.querySelector("#fields");
      if(area.children.length===1)return toast("至少保留一轮。");
      el.closest(".round-config").remove();
      area.querySelectorAll("legend").forEach((legend,index)=>legend.textContent=`第 ${index+1} 轮`);
    }else if(action==="draw"){
      if(!canOperate||state.reveal)return;
      busy=true;
      el.disabled=true;
      el.textContent="正在开奖…";
      window.scrollTo(0,0);
      await change({action},state.revision);
    }else if(action==="fullscreen"){
      if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();
    }else if(action==="retry")await refresh(true);
    else confirmAction(el);
  }catch(error){toast(error.message);}finally{busy=false;el.disabled=false;}
});
dialog.addEventListener("cancel",e=>{if(busy)e.preventDefault();});
document.addEventListener("fullscreenchange",()=>{
  const toggle=app.querySelector('[data-action="fullscreen"]');
  if(toggle)toggle.textContent=document.fullscreenElement?"退出全屏":"全屏显示";
});
document.addEventListener("submit",async e=>{
  e.preventDefault();if(busy)return;busy=true;
  const f=e.target,submit=f.querySelector('button[type="submit"]');submit.disabled=true;
  try{
    if(f.id==="modalForm"){await activeForm(f);dialog.close();}
    if(f.id==="joinForm"){
      const record=await api({action:"register",name:f.elements.name.value,student:f.elements.student.value});
      f.innerHTML=`<div class="success">${record.duplicate?"该学号已报名":"报名成功"}</div><p>本学号已登记，从第 ${record.eligible} 轮起具备抽奖资格。中奖后请留意主持人叫号。</p>`;
    }
  }catch(error){f.querySelector(".error").textContent=error.message;}finally{submit.disabled=false;busy=false;}
});
if(!id)home();
else{
  await refresh(true);
  if(mode!=="join")setInterval(()=>{if(!busy&&!dialog.open&&!document.hidden)refresh();},1800);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&!dialog.open&&mode!=="join")refresh();});
}

