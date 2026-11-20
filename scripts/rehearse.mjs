import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lottery } from "../lib/lottery.mjs";

const root = new URL("../", import.meta.url);
const port = Number(process.env.LOTTERY_PORT || 8765);
const folder = new URL(".sites-runtime/", root);
mkdirSync(folder, { recursive: true });
const connection = new DatabaseSync(process.env.LOTTERY_TEST_MEMORY === "1" ? ":memory:" : fileURLToPath(new URL("rehearsal.sqlite", folder)));
connection.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
if (connection.prepare("PRAGMA user_version").get().user_version === 0) {
  connection.exec("BEGIN");
  connection.exec(readFileSync(new URL("drizzle/0000_lottery.sql", root), "utf8"));
  connection.exec("PRAGMA user_version=1; COMMIT");
}
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  run() {
    const statement = connection.prepare(this.sql);
    if (statement.columns().length) return { results: statement.all(...this.args), meta: { changes: 0 } };
    return { results: [], meta: { changes: statement.run(...this.args).changes } };
  }
}
const db = {
  prepare: sql => new Statement(sql),
  batch(queries) {
    connection.exec("BEGIN IMMEDIATE");
    try {
      const result = queries.map(q => q.run());
      connection.exec("COMMIT");
      return result;
    } catch (error) { connection.exec("ROLLBACK"); throw error; }
  }
};
const assets = new Map(Object.entries({ "lottery.html": "text/html", "lottery.js": "text/javascript", "lottery.css": "text/css", "qr.js": "text/javascript", "mark.svg": "image/svg+xml", "qr-LICENSE.txt": "text/plain" }));
const server = createServer(async (req, res) => {
  try {
    const address = "http://127.0.0.1:" + port;
    const url = new URL(req.url, address);
    if (![new URL(address).host, "localhost:" + port].includes(req.headers.host) ||
        (req.headers.origin && req.headers.origin !== "http://" + req.headers.host)) {
      res.writeHead(403).end(); return;
    }
    if (url.pathname === "/api/lottery") {
      let body = "";
      req.setEncoding("utf8");
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16384) { res.writeHead(413).end(); return; }
      }
      const request = new Request(url, { method: req.method, headers: req.headers, body: body || undefined });
      const result = await lottery(request, db);
      res.writeHead(result.status, Object.fromEntries(result.headers)).end(await result.text());
      return;
    }
    const path = url.pathname === "/" ? "lottery.html" : url.pathname.slice(1);
    if (!assets.has(path)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": assets.get(path) + "; charset=utf-8", "Cache-Control": "no-cache" });
    res.end(readFileSync(new URL("public/" + path, root)));
  } catch (error) {
    console.error("Request failed", error.message);
    res.writeHead(500).end("Request failed");
  }
});
const address = "http://127.0.0.1:" + port + "/";
const openRequested = process.argv.includes("--open") && process.platform === "win32";
function openBrowser() {
  const browser = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", address], { windowsHide: true, stdio: "ignore" });
  browser.on("error", () => console.log("请在浏览器中打开 " + address));
  browser.unref();
}
server.on("error", async error => {
  if (openRequested && error.code === "EADDRINUSE") {
    try {
      const response = await fetch(address, { signal: AbortSignal.timeout(2000) });
      if (response.ok && /src="\/lottery\.js(?:\?[^\"]*)?"/.test(await response.text())) {
        openBrowser();
        return;
      }
    } catch { /* Report the occupied port below. */ }
  }
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log("本机抽奖台  " + address);
  if (openRequested) openBrowser();
});

