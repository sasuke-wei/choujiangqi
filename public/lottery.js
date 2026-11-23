import { qrPath } from "./qr.js";

const params=new URLSearchParams(location.search), id=params.get("event"), mode=params.get("view")||"host";
const app=document.querySelector("#app"), dialog=document.querySelector("#dialog");
const awardDialog=document.querySelector("#awardDialog");
const qrDialog=document.querySelector("#qrDialog");
function saved(){try{return JSON.parse(localStorage.getItem("press-events")||"{}");}catch{return {};}}
const demoStorage="press-demo";
function demoKey(){
  try {
    const demo=JSON.parse(sessionStorage.getItem(demoStorage));
    return demo?.id===id?demo.key:undefined;
  } catch { return undefined; }
}
const key=id&&(saved()[id]?.key||demoKey());
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
const receiptStorageKey = "lottery-participant:" + id;
let participantReceipt = mode === "join" && id ? readParticipantReceipt() : "";
let participantPending = false, participantClosed = false;
function readParticipantReceipt() {
  for (const storage of ["localStorage", "sessionStorage"]) {
    try {
      const savedReceipt = window[storage].getItem(receiptStorageKey);
      if (savedReceipt) return savedReceipt;
    } catch { /* Some embedded browsers restrict storage. */ }
  }
  return "";
}
function saveParticipantReceipt(value) {
  participantReceipt = value;
  for (const storage of ["localStorage", "sessionStorage"]) {
    try {
      if (value) window[storage].setItem(receiptStorageKey, value);
      else window[storage].removeItem(receiptStorageKey);
    } catch { /* Keep the receipt in memory for this page. */ }
  }
}
function newParticipantReceipt() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
async function api(body, receipt){
  const options={cache:"no-store"};
  const authenticated=canOperate||(!body&&mode==="screen"&&key);
  const headers=authenticated?{"X-Lottery-Host-Key":key}:{};
  const query=new URLSearchParams();
  if(id)query.set("id",id);
  if(receipt){query.set("view","result");headers["X-Lottery-Receipt"]=receipt;}
  if(body)Object.assign(options,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(body)});
  else options.headers=headers;
  const res=await fetch("/api/lottery?"+query,options).catch(()=>{throw Error("连接中断，请重试。");});
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
  document.body.classList.add("home-page");
  app.innerHTML=`<section class="start"><h1>现场抽奖</h1><div class="start-actions">${button("setup","配置新活动","primary")}${button("demo","体验演示","demo-entry")}</div></section>`;
}
function modal(title,content,fn,label="确认"){
  activeForm=fn;document.querySelector("#dialogBody").innerHTML=`<form id="modalForm" class="form stack">
    <h2 id="dialogTitle">${esc(title)}</h2>
    <div class="modal-fields stack">${content}</div>
    <footer class="modal-footer stack"><p class="error" role="alert"></p>
      <div class="actions"><button class="primary" type="submit">${esc(label)}</button>${button("cancel","取消")}</div>
    </footer></form>`;
  dialog.showModal();
}
async function create(title,rounds){
  const result=await api({action:"create",title,rounds});
  localStorage.setItem("press-events",JSON.stringify({...saved(),[result.id]:{title,key:result.key}}));
  location.assign(link("host",result.id));
}
async function openDemo(){
  const result=await api({action:"create-demo"});
  sessionStorage.setItem(demoStorage,JSON.stringify(result));
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
  if(state.current===state.rounds.length){
    if(qrDialog.open)qrDialog.close();
    return `<div class="qrbox"><h2>报名已截止</h2></div>`;
  }
  if(!qrMarkup){
    const joinPath=link("join");
    const {size,path}=qrPath(new URL(joinPath,location.href).href);
    qrMarkup=`<a class="qr" href="${esc(joinPath)}" target="_blank" rel="noopener" aria-label="打开本场报名页"><svg role="img" aria-label="本场报名二维码" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="currentColor"/></svg></a>`;
  }
  return `<div class="qrbox"><div class="qr-heading"><h2>扫码报名</h2>${button("zoom-qr","放大二维码","qr-zoom",'aria-haspopup="dialog" aria-controls="qrDialog"')}</div>${qrMarkup}</div>`;
}
function roundAction(){
  const next=state.rounds[state.current];
  if(next)return button("draw",`抽取第 ${state.current+1} 轮 · ${esc(next.prize)} · ${next.quota} 人`,"light");
  return state.closed?"":button("close","结束本场活动","light");
}
let revealTimer, revealSettling=false;
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
async function settleReveal(previous, next) {
  const track=app.querySelector(".name-track");
  if(!track)return;
  const winners=next.rounds[next.current-1].wins.filter(winner=>!winner.absent);
  const finalNames=previous.reveal.kind==="replace"?winners.slice(-1):winners;
  if(!finalNames.length)return;

  clearTimeout(revealTimer);
  for(const animation of track.getAnimations?.()??[])animation.cancel();
  const featured=track.querySelector(".featured");
  track.parentElement.classList.add("is-settled");
  track.style.setProperty("--lanes",String(Math.min(4,finalNames.length)));
  featured.replaceChildren(...finalNames.map(({name})=>{
    const cell=document.createElement("span");
    cell.textContent=name;
    return cell;
  }));
  app.querySelector(".reel-status").textContent=previous.reveal.kind==="replace"?"补抽结果":"本轮中奖名单";
  revealSettling=true;
  try{await new Promise(resolve=>setTimeout(resolve,1100));}
  finally{revealSettling=false;}
}
function stage(){
  const isDemo=state.kind==="demo";
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
  const attendance=isDemo?`<b id="attendance">${state.count}</b> 位虚构参与者`:`已报名 <b id="attendance">${state.count}</b> 人 · ${state.closed?"活动已结束":next?"报名进行中":"报名已截止"}`;
  app.innerHTML=`<div class="heading"><div><h1>${esc(state.title)}</h1><p class="event-meta">${attendance}</p></div>${isDemo?`<div class="actions demo-controls">${fullscreen}<a class="button" href="${listUrl}">退出演示</a></div>`:fullscreen}</div>
    <div class="stagegrid${isDemo?" demo-stage":""}"><div class="broadcast">${board}</div>${isDemo?"":qrBox()}</div>${tools}`;
  if(state.reveal)runRevealClock(state.reveal);
}
function showAwardScreen(previous, next) {
  if (!canOperate || !previous || next.reveal || !next.current || awardDialog.open) return;
  const round = next.rounds[next.current - 1];
  const oldRound = previous.rounds[next.current - 1];
  const newResult = previous.reveal || previous.current < next.current ||
    round.wins.length > (oldRound?.wins.length ?? 0);
  if (!newResult) return;
  const winners = round.wins.filter(winner => !winner.absent);
  if (!winners.length) return;
  if (qrDialog.open) qrDialog.close();
  awardDialog.querySelector("#awardRound").textContent = `第 ${next.current} 轮 · ${round.prize}`;
  const list = awardDialog.querySelector("#awardWinners");
  list.innerHTML = winners.map(winner =>
    `<li><strong>${esc(winner.name)}</strong><small>学号尾号 ${esc(winner.suffix)}</small></li>`
  ).join("");
  awardDialog.showModal();
  awardDialog.querySelector(".award-scroll").scrollTop = 0;
}
function renderActivity(){
  clearTimeout(revealTimer);
  document.body.classList.toggle("stage",mode!=="join");
  if(mode==="join")join();else stage();
}
function showParticipantResult(result) {
  const panel = document.querySelector("#participantResult");
  if (!panel) return;
  const form = document.querySelector("#joinForm");
  form.hidden = true;
  document.querySelector(".entry .poster-description").hidden = true;
  panel.hidden = false;
  participantClosed = result.closed === true;
  let content;
  if (result.status === "won") {
    content = `<h2>恭喜您中奖！</h2><p>您抽中了<strong class="participant-prize">「${esc(result.prize)}」</strong>。</p><p>第 ${result.round} 轮 · 请按现场安排领奖。</p>`;
  } else if (result.status === "absent") {
    content = `<h2>本轮已登记缺席</h2><p>您的第 ${result.round} 轮中奖记录已标记缺席。如有疑问，请联系现场工作人员。</p>`;
  } else if (result.status === "finished") {
    content = `<h2>本场抽奖已结束</h2><p>您本场未中奖。感谢参与。</p>`;
  } else {
    content = `<h2>报名成功</h2><p>您从第 ${result.eligible} 轮起参与抽奖。</p><p class="helper">保留此页面，开奖后会自动显示您的结果。</p>`;
  }
  if (panel.dataset.content !== content) {
    panel.innerHTML = content;
    panel.dataset.content = content;
  }
}
async function refreshParticipantResult() {
  if (!participantReceipt || participantPending || participantClosed || document.hidden ||
      !document.querySelector("#participantResult")) return;
  participantPending = true;
  try {
    showParticipantResult(await api(undefined, participantReceipt));
  } catch {
    // Retain the displayed result during a connection interruption and retry on the next poll.
  } finally {
    participantPending = false;
  }
}
const signupFields = `<label>姓名<input name="name" required maxlength="40" autocomplete="name" placeholder="请输入完整姓名"></label><label>学号<input name="student" required minlength="4" maxlength="32" spellcheck="false" placeholder="请输入学号"></label><p class="helper">同一学号限报一次。开奖时大屏会滚动显示姓名，中奖后显示姓名和学号后四位。</p>`;
function join(){
  if(state.kind==="demo"){
    app.innerHTML=`<div class="entry">${hero("抽奖演示",state.title,"演示活动无需报名。")}</div>`;
    return;
  }
  const stopped=state.current===state.rounds.length;
  app.innerHTML=`<div class="entry">${hero("活动报名",state.title,stopped?"本场报名已结束":`现在报名可参加第 ${state.current+1} 轮及后续抽奖`)}<form id="joinForm" class="form panel below stack"><h2>${stopped?"报名已截止":"填写报名信息"}</h2>${stopped?"":`${signupFields}<button class="primary" type="submit">确认报名</button>`}<p class="error" role="alert"></p></form><section id="participantResult" class="entry-result below stack" role="status" hidden></section></div>`;
}
async function refresh(force=false){
  if(revealSettling)return;
  const n=++sequence;
  try{
    const next=await api();if(n!==sequence)return;
    const previous=state;
    if(previous?.reveal&&!next.reveal&&next.revision===previous.revision)await settleReveal(previous,next);
    const changed=force||!previous||next.revision!==previous.revision||Boolean(next.reveal)!==Boolean(previous.reveal);
    const attendance=document.querySelector("#attendance");
    if(attendance)attendance.textContent=String(next.count);
    state=next;
    if(changed)renderActivity();
    showAwardScreen(previous,next);
    if(mode==="join")void refreshParticipantResult();
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
    else if(action==="demo"){
      busy=true;
      el.disabled=true;
      await openDemo();
    }
    else if(action==="cancel")dialog.close();
    else if(action==="zoom-qr"){
      qrDialog.querySelector("#qrLarge").replaceChildren(el.closest(".qrbox").querySelector(".qr svg").cloneNode(true));
      qrDialog.showModal();
    }
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
qrDialog.querySelector("#qrReturn").addEventListener("click",()=>qrDialog.close());
awardDialog.querySelector("#awardReturn").addEventListener("click",()=>awardDialog.close());
awardDialog.addEventListener("close",()=>{
  app.querySelector('.desk-action [data-action="draw"], .desk-action [data-action="close"]')?.focus({preventScroll:true});
});
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
      if(!participantReceipt)saveParticipantReceipt(newParticipantReceipt());
      const record=await api({action:"register",name:f.elements.name.value,student:f.elements.student.value,receipt:participantReceipt});
      if(record.canViewResults){
        showParticipantResult({eligible:record.eligible,status:"waiting"});
        void refreshParticipantResult();
      }else{
        saveParticipantReceipt("");
        f.innerHTML=`<h2>该学号已报名</h2><p>请在原报名设备查看结果，或留意现场开奖。</p>`;
      }
    }
  }catch(error){f.querySelector(".error").textContent=error.message;}finally{submit.disabled=false;busy=false;}
});
if(!id)home();
else{
  await refresh(true);
  if(mode==="join")setInterval(refreshParticipantResult,5000+Math.floor(Math.random()*2000));
  else setInterval(()=>{if(!busy&&!dialog.open&&!awardDialog.open&&!document.hidden)refresh();},1800);
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden||dialog.open||awardDialog.open)return;
    if(mode==="join")void refreshParticipantResult();else void refresh();
  });
}

