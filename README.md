# 抽奖台

## 在这台电脑上使用

双击「启动抽奖台.cmd」，或使用同一浏览器打开 http://127.0.0.1:8765/ 。本机版使用 Node.js 24 自带的 SQLite，无需联网。电脑保持开机并保留服务窗口。

- 点击「配置新活动」，填写活动名称、奖品和人数。预留四轮，可增加或移除，创建后从零报名。打开配置窗口中的「已有活动」可继续之前创建的正式活动。
- 扫描活动二维码，或点击二维码打开该场的报名页。姓名和学号只需填写一次，提交后会提示从哪一轮起参加。
- 电脑连接投影后直接打开活动。点击「抽取第 1 轮」，本轮候选人的姓名会快速滚动并逐渐减速，约 7 秒后在原处揭晓中奖姓名和学号尾号。同一页面可全屏、报名、补抽和继续下一轮。在「奖项与开奖记录」中调整未开奖的奖品及名额。
- 开奖时已锁定结果。刷新会接着剩余倒计时，动画期间仍可报名后续轮次。补抽有人可选时也播放揭晓动画，没人可选时直接提示名额空缺。
- 每轮开奖后先点名。对缺席者点「缺席并补抽」。开始下一轮前完成本轮补抽。最后一轮仍可补抽，核对完再结束活动。

开奖时锁定本轮资格，之后报名的同学从下一轮开始参加。已经抽中过的人，包括缺席者，均退出本场候选名单。人数不足时主持人可等待报名或调小名额。若补抽时无人可选，记录缺席并保留空缺。

名单和结果保存在本机 `.sites-runtime/rehearsal.sqlite`。主持权限保存在创建活动的浏览器中，请保留该浏览器的网站数据。重复打开活动或重启服务后可以继续。系统按活动保存规范化学号的摘要和后四位，展示时仅使用完整姓名与尾号。

## 运行与验证

`node scripts/rehearse.mjs` 启动本机服务。运行 `node --test tests/lottery.test.mjs` 可用独立内存数据库验证开奖规则和并发操作。

本机运行时，二维码指向本机的活动报名地址。手机流量和校园网扫码需要公网 HTTPS 服务。

## 自行部署到 Cloudflare Workers

1. 安装 Node.js 24，在仓库根目录运行 `npm ci` 和 `npm run build`。
2. 在自己的 Cloudflare 账号创建 D1 数据库。打开构建生成的 `dist/server/wrangler.json`，设置 Worker 的 `name`，并在 `d1_databases` 中填写自己的数据库名称和 ID。保留绑定名 `DB`，设置 `migrations_dir` 为 `../../drizzle`。重新构建后需重新填写这些部署设置。
3. 连接自己的 Cloudflare 账号后，在仓库根目录执行以下命令。

   ```sh
   npx wrangler d1 migrations apply DB --remote --config dist/server/wrangler.json
   npx wrangler deploy --config dist/server/wrangler.json
   ```

4. 使用部署的 HTTPS 地址创建活动。主持权限随创建活动的浏览器保存。学生使用现场二维码报名。

[Wrangler 配置参考](https://developers.cloudflare.com/workers/wrangler/configuration/) · [D1 迁移文档](https://developers.cloudflare.com/d1/reference/migrations/)
