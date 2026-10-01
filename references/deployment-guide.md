# Deployment and Optional Shared State

状态：用户完成本地预览后的可选操作。  
原则：生成、公开部署、云端共享是三次独立决定；前一步不自动授权后一步。

## 1. Local preview is the default result

在模板目录运行：

```bash
node local-preview-server.mjs
```

打开终端实际输出的 `http://127.0.0.1:.../` 地址；默认端口被占用时，以服务器输出的后续端口为准。

这是本机预览地址：

- 只有本地服务器运行时可访问；
- 默认不会被互联网访问；
- 不是 GitHub 或 Cloudflare 的线上部署；
- `trip-data.json > config.persistence.mode = "local"` 时，Todo、Ticket 状态与 Ledger 数据只保存在当前浏览器。

生成完成后，Agent 必须先交付这个结果，并明确询问/等待用户是否另行发布。不得把“生成网页”理解成已授权 Git push 或 Cloudflare 操作。

## 2. Before any deployment

运行发布检查：

```bash
npm run build:map
npm run validate
```

对于用户自己的旅行内容，公开部署前只提醒一次“获得链接的人可能查看页面内容”，并由用户明确决定原样发布、处理选定内容或增加访问保护。不得因为发现以下内容就自动删除、隐藏、打码或拒绝本地生成：

- 原始 PDF、票据、订单截图、护照或私人工作记录；
- 二维码、PNR、订单号、联系人、未批准公开的地址或金额；

无论用户如何选择旅行内容，以下开发凭据都不得进入静态页面或公开仓库：

- `.env`、`.dev.vars`、token、secret、private key；
- Cloudflare account ID、D1 database ID、binding ID、数据库导出；
- 浏览器导出的runtime state或任何本地调试数据；
- 未获授权的地图、图片、字体或其他素材。

如果私人文件曾提交到 Git 历史，仅删除工作区文件不够；应建立一个新的干净仓库。

## 3. Publish with GitHub + Cloudflare Pages

静态发布不需要 D1。保持：

```json
{
  "persistence": {
    "mode": "local"
  }
}
```

步骤：

1. 在 GitHub 创建一个新的仓库；公开或私人仓库都可以连接 Cloudflare Pages。只提交通过 publish profile 的文件。
2. 将本模板目录作为站点根目录推送到该仓库。
3. 在 Cloudflare Dashboard 进入 **Workers & Pages → Create application → Pages → Connect to Git**。
4. 授权 Cloudflare 访问这一个 GitHub 仓库，选择生产分支。
5. 这是无编译的静态站点：不要添加应用构建命令；把包含 `index.html` 的模板目录设为输出目录。若仓库根就是模板目录，输出目录使用根目录。
6. 完成首次部署，打开 Cloudflare 提供的 `*.pages.dev` 地址，重新检查模块、地图和本地浏览器持久化。

Git 集成后，每次推送到生产分支都会触发部署；其他分支可以产生独立 Preview URL。以 Cloudflare 当前官方说明为准：

- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Cloudflare Pages Git configuration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [GitHub: Creating a new repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)

### What local persistence means on a public site

网页可以公开访问，但每台设备、每个浏览器保存的是自己的 Todo、Ticket 状态和 Ledger 数据：

- 不同设备不会自动同步；
- 清除该站点的浏览器数据会清除本机状态；
- 不会因为部署到 Cloudflare Pages 就自动上传到作者的数据库；
- 页面不应请求 `/api/trip`，也不应显示“缺少 D1”错误。

如果这正是用户想要的行为，到这里已经完成，无需创建数据库。

## 4. Opt in to user-owned Cloudflare D1

只有用户明确提出“多人或多设备共享 Todo、Ticket 或 Ledger”时，才进入本节。启用 D1 前应再次说明：数据会写入用户自己的 Cloudflare 账户，且当前 API 的访问控制限制见下文。

### 4.1 Configure the website

把 `trip-data.json > config.persistence` 改为以下结构，并只列出用户明确要共享的 collection：

```json
{
  "persistence": {
    "mode": "d1",
    "apiBase": "/api/trip",
    "sharedCollections": ["todos", "tickets", "ledger"]
  }
}
```

配置必须符合 `schemas/trip-data.schema.json` 中的 `config` 定义。`apiBase` 通常保持同源 `/api/trip`；只有部署架构明确不同并经用户确认时才改变。不要自行增加 database ID、account ID、token、binding ID 或 secret。

### 4.2 Create the user's database

用户可以在自己的 Cloudflare Dashboard 创建一个全新的 D1 database。不要复用模板作者、Agent 或其他项目的数据库。

D1模板位于`optional/cloudflare-d1/`，不会随普通静态站点自动启用。用户明确选择shared mode后，先把`optional/cloudflare-d1/functions/`复制到部署根目录的`functions/`，再由用户在D1 Console执行`optional/cloudflare-d1/migrations/0001_shared_trip_data.sql`，或在用户明确授权远端变更后使用Wrangler：

```bash
npx wrangler d1 execute <USER_DATABASE_NAME> \
  --remote \
  --file=./optional/cloudflare-d1/migrations/0001_shared_trip_data.sql
```

`<USER_DATABASE_NAME>` 必须由用户提供或从其账户中确认，不能猜测。`--remote` 会修改云数据库；Agent 不得因用户只要求生成或部署静态页面而自动执行。

参考：

- [Cloudflare D1 getting started](https://developers.cloudflare.com/d1/get-started/)
- [Wrangler D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

### 4.3 Bind D1 to the Pages project

在用户自己的 Cloudflare Pages 项目中：

1. 打开 **Settings → Bindings → Add → D1 database bindings**；
2. Variable name 填 `DB`；
3. 选择用户刚创建的 D1 database；
4. 保存后重新部署，使 binding 生效。

仓库不保存这个 binding 指向的 database ID。生产环境和 Preview 环境的 binding 分开检查。参考 [Cloudflare Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases)。

`local-preview-server.mjs`是纯静态GET/HEAD服务器，不提供`/api/trip`，也不会接触D1。需要本地联调shared mode时，必须在用户已明确选择D1后使用Cloudflare开发环境；例如在已复制`functions/`的部署根运行：

```bash
npx wrangler pages dev . --d1 DB=<USER_DATABASE_ID>
```

占位ID必须来自用户自己的Cloudflare资源，并且不能提交到仓库。普通local mode不需要Wrangler。

### 4.4 Verify before sharing

确认部署根目录已包含从可选模板复制出的`functions/api/trip/`，然后重新部署并检查：

- `trip-data.json > config.persistence.mode` 明确为 `d1`，且 collection allowlist 正确；
- `/api/trip/<trip-id>` 返回预期 JSON，不泄露其他 Trip；
- 两台设备对已启用 collection 的新增、编辑和删除能够同步；
- 未加入共享 allowlist 的状态仍只留在浏览器；
- 刷新和网络失败时页面不会把读取失败误报为空数据。

## 5. Security boundary

`metadata.tripId` 只是数据分区键，不是密码。当前 Pages Function 没有用户登录、记录级授权或冲突合并机制。若站点和 API 对公网开放，知道站点与 Trip ID 的访问者理论上可能读写共享数据。

因此：

- 不要在 D1 存票据原件、二维码、订单号、护照或其他高敏感资料；
- 需要私密共享时，应在发布前由用户选择 Cloudflare Access 或另行实现经过确认的认证；
- 同一记录被多设备同时修改时，可能发生后写覆盖；
- Ledger 的币种设置当前仍可能保持浏览器本地，而不是跨设备共享，具体以 `golden-ledger-spec.md` 为准。

认证、访问策略或冲突控制都是单独的产品/部署任务，不能因“启用了 D1”而自动扩大授权范围。

## 6. Required deployment handoff

如果只完成本地预览，使用清晰措辞：

> 当前提供的是本地预览地址，只在你的电脑上且预览服务运行时可访问，并未公开部署。若要发布为网页，请另行按 GitHub + Cloudflare Pages 流程操作。普通静态发布不需要数据库；只有需要多人、多设备共享记账、Todo 或 Ticket 状态时，才需要明确启用并绑定你自己的 Cloudflare D1。

如果完成了公开部署，则另外报告：

- 线上 URL；
- GitHub repository 与 production branch；
- `persistence.mode`；
- 是否存在 D1 binding，以及它属于哪个用户项目（不得输出秘密或完整 ID）；
- 已执行哪些 migration；
- API 是否有认证保护及已知风险。
