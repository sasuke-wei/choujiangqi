class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const revealDuration = 7000;
function check(ok, message, status) { if (!ok) throw new InputError(message, status); }
async function digest(value) {
  const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(data), n => n.toString(16).padStart(2, "0")).join("");
}
function label(value, limit) {
  check(typeof value === "string", "请填写完整信息。");
  const clean = value.trim();
  check(clean && clean.length <= limit && !/[\u0000-\u001f\u007f]/u.test(clean), "请检查名称和长度。");
  return clean;
}
function award(data) {
  check(Number.isInteger(data?.quota) && data.quota >= 1 && data.quota <= 500, "每轮名额应为 1 至 500 人。");
  return { prize: label(data.prize, 32), quota: data.quota, wins: [] };
}
function choose(pool, count) {
  const result = [];
  const word = new Uint32Array(1);
  while (result.length < count && pool.length) {
    const limit = 2 ** 32 - (2 ** 32 % pool.length);
    do { crypto.getRandomValues(word); } while (word[0] >= limit);
    const [p] = pool.splice(word[0] % pool.length, 1);
    result.push({ id: p.id, name: p.name, suffix: p.suffix, absent: false });
  }
  return result;
}
const demoActivity = {
  title: "现场抽奖演示",
  rounds: [
    { prize: "校园纪念书签", quota: 3 },
    { prize: "纪念帆布袋", quota: 2 },
    { prize: "校园手记本", quota: 2 },
    { prize: "校园纪念礼盒", quota: 1 },
  ],
};
const demoNames = [
  "林晓", "陈思远", "周可欣", "沈一帆", "刘畅", "许宁", "赵星河", "顾言", "陆晨", "杨悦",
  "郑安", "吴桐", "苏晴", "程宇", "徐嘉", "梁舒", "方圆", "何佳", "韩露", "邓泽",
  "宋扬", "高远", "李青", "唐佳音", "罗可", "潘然", "余静", "白子衿", "魏欣", "姚书宁",
];
async function create(db, data, isDemo = false) {
  check(Array.isArray(data.rounds) && data.rounds.length >= 1 && data.rounds.length <= 20, "请设置 1 至 20 轮奖品。");
  const state = { title: label(data.title, 48), rounds: data.rounds.map(award), current: 0, closed: false };
  if (isDemo) state.kind = "demo";
  const id = crypto.randomUUID();
  const key = crypto.randomUUID() + crypto.randomUUID();
  const event = db.prepare("INSERT INTO events (id,host,state) VALUES (?,?,?)")
    .bind(id, await digest(key), JSON.stringify(state));
  if (isDemo) {
    const participants = await Promise.all(demoNames.map(async (name, index) => {
      const suffix = String(9001 + index);
      const student = await digest(id + "/DEMO-" + suffix);
      return db.prepare("INSERT INTO people(event,student,name,suffix,eligible) VALUES (?,?,?,?,1)")
        .bind(id, student, name, suffix);
    }));
    await db.batch([event, ...participants]);
  } else {
    await event.run();
  }
  return { id, key };
}
async function receiptDigest(id, receipt) {
  check(typeof receipt === "string" && /^[0-9a-f]{64}$/.test(receipt), "报名凭证无效。");
  return digest(id + "/receipt/" + receipt);
}
async function register(db, id, data) {
  const name = label(data.name, 40);
  const student = String(data.student ?? "").normalize("NFKC").trim().toUpperCase();
  check(/^[0-9A-Z-]{4,32}$/.test(student), "学号支持 4 至 32 位数字、字母或短横线。");
  const hash = await digest(id + "/" + student);
  const receipt = data.receipt == null ? null : await receiptDigest(id, data.receipt);
  const [write, record, event] = await db.batch([
    db.prepare(`INSERT INTO people(event,student,name,suffix,eligible,receipt)
      SELECT id,?,?,?,json_extract(state,'$.current')+1,? FROM events
      WHERE id=? AND json_extract(state,'$.demo') IS NOT 1 AND json_extract(state,'$.kind') IS NOT 'demo'
        AND json_extract(state,'$.closed')=0 AND json_extract(state,'$.current')<json_array_length(state,'$.rounds')
      ON CONFLICT DO NOTHING`).bind(hash, name, student.slice(-4), receipt, id),
    db.prepare("SELECT eligible,receipt FROM people WHERE event=? AND student=?").bind(id, hash),
    db.prepare("SELECT json_extract(state,'$.kind') AS kind FROM events WHERE id=? AND json_extract(state,'$.demo') IS NOT 1").bind(id),
  ]);
  check(event.results.length, "活动不存在。", 404);
  check(event.results[0].kind !== "demo", "演示活动无需报名。", 409);
  check(record.results.length, "本场报名已结束。", 409);
  const saved = record.results[0];
  return { duplicate: !write.meta.changes, eligible: saved.eligible, canViewResults: receipt !== null && receipt === saved.receipt };
}
async function participantResult(db, id, value) {
  const receipt = await receiptDigest(id, value);
  const records = await db.prepare("SELECT people.id,people.eligible,events.state FROM people JOIN events ON events.id=people.event WHERE people.event=? AND people.receipt=?")
    .bind(id, receipt).run();
  check(records.results.length, "找不到本设备的报名记录。", 404);
  const person = records.results[0];
  const state = JSON.parse(person.state);
  const pending = state.reveal?.until > Date.now();
  const finished = state.closed || (!pending && state.current === state.rounds.length);
  const result = { eligible: person.eligible, status: finished ? "finished" : "waiting", closed: state.closed };
  for (const [index, round] of state.rounds.entries()) {
    const winner = round.wins.find(item => item.id === person.id);
    if (!winner) continue;
    if (pending && index + 1 === state.current &&
        (state.reveal.kind === "draw" || winner === round.wins.at(-1))) continue;
    return { ...result, status: winner.absent ? "absent" : "won", prize: round.prize, round: index + 1 };
  }
  return result;
}
async function snapshot(db, id, hostKey) {
  const [events, counts] = await db.batch([
    db.prepare("SELECT revision,state,host FROM events WHERE id=?").bind(id),
    db.prepare("SELECT count(*) AS n FROM people WHERE event=?").bind(id),
  ]);
  check(events.results.length, "活动不存在，请重新打开活动入口。", 404);
  const { revision, state, host } = events.results[0];
  const { reveal, demo, ...activity } = JSON.parse(state);
  check(!demo, "活动不存在，请重新打开活动入口。", 404);
  const remainingMs = (reveal?.until ?? 0) - Date.now();
  let pending = null;
  if (remainingMs > 0) {
    activity.rounds[activity.current - 1].wins = [];
    pending = { kind: reveal.kind, remainingMs, durationMs: revealDuration };
    if (hostKey && Array.isArray(reveal.names) && await digest(hostKey) === host) {
      pending.names = reveal.names;
    }
  }
  return { ...activity, revision, count: counts.results[0].n, reveal: pending };
}
async function operate(db, id, data, key) {
  const host = await digest(key);
  for (let attempt = 0; attempt < 8; attempt++) {
    const [events, people] = await db.batch([
      db.prepare("SELECT * FROM events WHERE id=?").bind(id),
      db.prepare("SELECT id,name,suffix,eligible FROM people WHERE event=? ORDER BY id").bind(id),
    ]);
    const event = events.results[0];
    check(event && event.host === host, "只有创建本场活动的主持人能操作。", 403);
    check(event.revision === data.revision, "现场状态已更新，请核对最新结果。", 409);
    const state = JSON.parse(event.state);
    check(!state.demo, "活动不存在，请重新打开活动入口。", 404);
    check(!state.closed, "本场活动已经结束。", 409);
    check(!(state.reveal?.until > Date.now()), "本轮正在揭晓，请稍候。", 409);
    delete state.reveal;
    const next = data.action === "draw";
    const number = state.current + (next ? 1 : 0);
    const round = state.rounds[number - 1];
    const used = new Set(state.rounds.flatMap(r => r.wins.map(w => w.id)));
    const pool = people.results.filter(p => p.eligible <= number && !used.has(p.id));
    if (next) {
      check(round, "所有轮次都已开奖。", 409);
      check(pool.length >= round.quota, "候选人数不足，请等待报名或调整本轮名额。", 409);
      round.wins = choose([...pool], round.quota);
      state.current = number;
      state.reveal = { kind: "draw", until: Date.now() + revealDuration, names: pool.map(p => p.name) };
    } else if (data.action === "replace") {
      const missing = round?.wins.find(w => w.id === data.person && !w.absent);
      check(missing, "这位同学的结果已更新。", 409);
      missing.absent = true;
      const alternates = choose([...pool], 1);
      round.wins.push(...alternates);
      if (alternates.length) state.reveal = { kind: "replace", until: Date.now() + revealDuration, names: pool.map(p => p.name) };
    } else if (data.action === "close") {
      check(number === state.rounds.length, "请完成所有轮次后结束活动。", 409);
      state.closed = true;
    } else if (data.action === "configure") {
      const i = data.index;
      check(Number.isInteger(i) && i >= state.current && i < state.rounds.length, "只能调整尚未开奖的轮次。", 409);
      state.rounds[i] = award(data.round);
    } else throw new InputError("操作无效。");
    // A competing signup must either enter this draw or receive the next round number.
    const changed = await db.prepare("UPDATE events SET state=?,revision=revision+1 WHERE id=? AND revision=? AND (SELECT count(*) FROM people WHERE event=?)=?")
      .bind(JSON.stringify(state), id, event.revision, id, people.results.length).run();
    if (changed.meta.changes) return { ok: true };
  }
  throw new InputError("报名人数正在更新，请再点一次。", 409);
}
export async function lottery(request, database) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const db = database.withSession?.("first-primary") ?? database;
    const params = new URL(request.url).searchParams;
    const id = params.get("id") ?? "";
    const hostKey = request.headers.get("x-lottery-host-key") ??
      /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
    if (request.method === "GET") {
      const result = params.get("view") === "result"
        ? await participantResult(db, id, request.headers.get("x-lottery-receipt"))
        : await snapshot(db, id, hostKey);
      return Response.json(result, { headers });
    }
    check(request.method === "POST", "请求方式无效。", 405);
    check(request.headers.get("content-type")?.startsWith("application/json"), "请求格式无效。", 415);
    const body = await request.text();
    check(body.length <= 16384, "提交内容过长。", 413);
    let data;
    try { data = JSON.parse(body); } catch { throw new InputError("提交内容无效。"); }
    check(data && typeof data === "object", "提交内容无效。");
    let output;
    if (data.action === "create") output = await create(db, data);
    else if (data.action === "create-demo") output = await create(db, demoActivity, true);
    else if (data.action === "register") output = await register(db, id, data);
    else output = await operate(db, id, data, hostKey);
    return Response.json(output, { headers });
  } catch (error) {
    if (!(error instanceof InputError)) console.error("Lottery storage failed", error.name);
    return Response.json({ error: error instanceof InputError ? error.message : "暂时无法连接活动，请稍后重试。" }, { status: error.status ?? 500, headers });
  }
}
