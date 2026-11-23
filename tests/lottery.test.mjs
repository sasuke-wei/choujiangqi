import {after, before, test} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import net from "node:net";

let server, base;
before(async () => {
  const probe = net.createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise(done => probe.close(done));
  base = "http://127.0.0.1:" + port + "/api/lottery";
  server = spawn(process.execPath, ["scripts/rehearse.mjs"], {
    cwd: new URL("../", import.meta.url), stdio: ["ignore", "pipe", "inherit"],
    env: {...process.env, LOTTERY_TEST_MEMORY: "1", LOTTERY_PORT: String(port)}
  });
  await Promise.race([once(server.stdout,"data"), once(server,"exit").then(()=>{throw Error("Server exited");})]);
});
after(() => server?.kill());
async function request(id, body, key) {
  const headers = key ? {Authorization:"Bearer " + key} : {};
  const opts = body ? {method: "POST", headers: {...headers,"Content-Type":"application/json"}, body:JSON.stringify(body)} : {headers};
  const response = await fetch(base + "?id=" + id, opts);
  return {status:response.status, data:await response.json()};
}
async function event(quotas) {
  const result = await request("", {action:"create", title:"测试活动", rounds:quotas.map((quota,i)=>({prize:"奖品"+i,quota}))});
  assert.equal(result.status,200);
  return result.data;
}
const join = (id,student,receipt) => request(id,{action:"register", name:"同名同学", student, receipt});
const proof = value => value.toString(16).padStart(64,"0");
async function participant(id,receipt) {
  const response = await fetch(base+"?id="+id+"&view=result", { headers: receipt ? {"X-Lottery-Receipt":receipt} : {} });
  return {status:response.status, data:await response.json()};
}
async function revealed(id) {
  let {data} = await request(id);
  while (data.reveal) {
    await new Promise(resolve => setTimeout(resolve, data.reveal.remainingMs + 10));
    ({data} = await request(id));
  }
  return data;
}
test("200 人并发报名、重复学号、四轮开奖和补抽",async()=>{
  const {id,key} = await event([3,2,2,1]);
  const people = await Promise.all(Array.from({length:200},(_,i)=>join(id,"A"+(10000+i),proof(i))));
  assert.ok(people.every(p=>p.status===200 && !p.data.duplicate && p.data.canViewResults));
  assert.equal((await join(id,"A10000",proof(0))).data.canViewResults,true);
  assert.equal((await join(id,"A10000",proof(300))).data.canViewResults,false);
  assert.equal((await participant(id,proof(300))).status,404);
  assert.equal((await participant(id)).status,400);
  assert.equal((await participant((await event([1])).id,proof(0))).status,404);
  assert.equal((await participant(id,proof(0))).data.status,"waiting");
  assert.ok((await join(id,"ａ１００００")).data.duplicate);
  assert.equal((await request(id)).data.count,200);
  assert.equal((await request(id,{action:"draw",revision:0})).status,403);
  const double = await Promise.all([0,1].map(()=>request(id,{action:"draw",revision:0},key)));
  assert.deepEqual(double.map(r=>r.status).sort(),[200,409]);
  const pending=(await request(id)).data;
  assert.equal(pending.reveal.kind,"draw");
  assert.equal(pending.reveal.durationMs,7000);
  assert.deepEqual(pending.rounds[0].wins,[]);
  assert.equal(pending.reveal.names,undefined);
  const beforeReveal=await Promise.all(Array.from({length:200},(_,i)=>participant(id,proof(i))));
  assert.ok(beforeReveal.every(p=>p.data.status==="waiting" && p.data.prize===undefined));
  assert.equal((await request(id,null,"invalid")).data.reveal.names,undefined);
  assert.equal((await request(id,{action:"draw",revision:pending.revision},key)).status,409);
  assert.equal((await join(id,"B99999")).data.eligible,2);
  const hostSnapshot=(await request(id,null,key)).data;
  assert.deepEqual(hostSnapshot.reveal.names,Array(200).fill("同名同学"));
  assert.deepEqual(hostSnapshot.rounds[0].wins,[]);
  let state=await revealed(id);
  const first=state.rounds[0].wins;
  assert.equal(first.length,3);
  assert.deepEqual(Object.keys(first[0]).sort(),["absent","id","name","suffix"]);
  const missedReceipt=proof(Number(first[0].suffix));
  const winningReceipt=proof(Number(first[1].suffix));
  assert.deepEqual((await participant(id,missedReceipt)).data, {eligible:1,status:"won",closed:false,prize:"奖品0",round:1});
  assert.equal((await request(id,{action:"replace",person:first[0].id,revision:state.revision},key)).status,200);
  assert.equal((await request(id)).data.reveal.kind,"replace");
  assert.equal((await participant(id,winningReceipt)).data.status,"won");
  assert.equal((await participant(id,missedReceipt)).data.status,"absent");
  assert.equal((await request(id,null,key)).data.reveal.names.length,197);
  state=await revealed(id);
  assert.deepEqual(state.rounds[0].wins.slice(0,3),[{...first[0],absent:true},...first.slice(1)]);
  assert.equal(state.rounds[0].wins.length,4);
  assert.equal((await participant(id,proof(Number(state.rounds[0].wins[3].suffix)))).data.status,"won");
  for(let i=1;i<4;i++){
    assert.equal((await request(id,{action:"draw",revision:state.revision},key)).status,200);
    state=await revealed(id);
  }
  const drawn=state.rounds.flatMap(r=>r.wins.map(w=>w.id));
  assert.equal(new Set(drawn).size,drawn.length);
  assert.equal((await join(id,"B88888")).status,409);
  assert.equal((await request(id,{action:"close",revision:state.revision},key)).status,200);
  assert.ok((await request(id)).data.closed);
});
test("名额不足可调整、迟到者不能补抽、候选耗尽留空、活动隔离",async()=>{
  const {id,key}=await event([2,1]);
  await join(id,"0001");
  assert.equal((await request(id,{action:"draw",revision:0},key)).status,409);
  assert.equal((await request(id,{action:"configure",index:0,round:{prize:"测试奖",quota:1},revision:0},key)).status,200);
  await request(id,{action:"draw",revision:1},key);
  const first=(await revealed(id)).rounds[0].wins[0];
  assert.equal(first.suffix,"0001");
  await join(id,"0002");
  await request(id,{action:"replace",person:first.id,revision:2},key);
  let state=(await request(id)).data;
  assert.equal(state.reveal,null);
  assert.deepEqual(state.rounds[0].wins,[{...first,absent:true}]);
  await request(id,{action:"draw",revision:3},key);
  state=await revealed(id);
  assert.equal(state.rounds[1].wins[0].suffix,"0002");
  const other=await event([1]);
  assert.equal((await join(other.id,"0001")).data.duplicate,false);
});

test("演示预置 30 人、独立于正式活动并使用正式开奖流程",async()=>{
  const created = await request("", {action:"create-demo"});
  assert.equal(created.status,200);
  const {id,key} = created.data;
  const initial = (await request(id)).data;
  assert.equal(initial.kind,"demo");
  assert.equal(initial.count,30);
  assert.deepEqual(initial.rounds.map(round=>round.quota),[3,2,2,1]);
  assert.equal((await join(id,"A9001")).status,409);
  assert.equal((await request(id,{action:"draw",revision:0},key)).status,200);
  assert.equal((await request(id,null,key)).data.reveal.names.length,30);
  assert.equal((await request(id)).data.reveal.names,undefined);

  const formal = await event([1]);
  assert.equal((await request(formal.id)).data.count,0);
  assert.equal((await join(formal.id,"A9001")).status,200);
});
