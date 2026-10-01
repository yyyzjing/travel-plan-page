---
name: generate-lightweight-travel-page
description: Assemble a Golden-style travel page from user materials with two short confirmations. Use ten fixed map templates, automatic deterministic template selection, one editable trip-data.json input, and lightweight validation.
---

# AI-Friendly Lightweight Travel Template

普通生成中，Agent 是模板装配员。第一版优先速度、稳定性和复用，不重新设计页面、地图或记账功能。

## 首次生成优先级

首次生成的目标是尽快交付一个可用、好看的网页底板，不是完成正式上线级验收。

已有模板和规则明确时，直接按本 Skill 生成，不重新审计框架或重复分析项目结构。用户资料能够从文本中明确提取时直接使用；只有内容无法识别、排版异常或存在明显歧义时，才做进一步的页面级视觉检查。

首次生成只做必要校验：数据可读取、页面正常加载、已开启模块正常显示、地图正常生成、无明显运行错误。完整的桌面/手机交互测试、逐项事实复核和边界场景检查不是默认步骤，需要时再执行。

`trip-data.json` 默认是不含任何示例旅行事实的空白底板，所有旅行数组为空，六个模块关闭。新旅行直接根据用户资料一次性写入，不查找、不识别、也不合并旧 Demo 数据。

## 普通生成只读范围

开始时只读：

- 用户上传的旅行资料；
- `trip-data.json`。

不要扫描整个 Repo，不要重新分析 Golden UI、记账、Runtime 或架构。只有用户明确要求修改某个模块，或轻量校验指出对应问题时，才定向读取相关 reference。

## 固定权限边界

普通生成只允许修改：

- `trip-data.json`；
- 本次旅行明确授权的 trip-specific assets。

`trip-data.json > routeMap` 和 `metadata.assets.routeMaps` 是构建派生字段，只由 `scripts/build-map.mjs` 写入；Agent 不手写这两处。

普通生成禁止修改：

- `index.html`、`styles.css`、`ledger.css`；
- `app.js`、`overview-map.js`、`route-ui.js`、`site-navigation.js`；
- `ledger.js`、记账金额/分账/结算算法；
- Golden Map Style、路线颜色、双 stroke、圆点、字体、图例和核心交互；
- Schema、Migration、Normalizer、Runtime、D1 或其他 Framework 级实现。

用户生成第一版后明确提出 DIY 请求，才进入自由修改模式；仍需保护用户未授权的数据和文件。

## 标准生成流程

### STEP 1：读取旅行资料

一次性读取用户提供的文档、文本或公开资料。不得把私人原始文件当作公共示例或可复用模板资源；但用户提供并要求用于本次本地页面的门票 PDF，按下文门票规则复制完整副本到本次旅行 asset，不因其中包含票号或二维码而追加隐私确认。测试和公共资源必须使用完全虚构或明确允许公开的数据。

### STEP 2：提取实际内容

提取：

- 日期与基本旅行信息；
- 国内/国外属性；国内行程在用户资料中明确表达的主要目的地名称；国外行程的目的地国家组合；
- 航班与住宿；
- 每日行程与地点顺序；
- 门票；
- 租车；
- 准备事项；
- 真正存在的缺口或冲突。

不要建立 `source-facts.json`，不要记录逐条 provenance、页码或 confidence，不要创建 canonical 中间层，也不要强制补齐所有 Entity 或 Stable ID 类别。

本地个人版以完整保留用户资料为默认。票号、二维码、Booking PIN、私人电话、完整预订号以及门票 PDF 中的其他内容都按用户提供的原文提取和使用；除非用户明确要求，否则不得在资料阅读、内容总结、模块确认、缺口确认或首次生成过程中主动建议隐藏、脱敏、删除、裁切或打码。它们不是“缺失材料”或需要额外确认的隐私问题。

### STEP 3：第一次确认（模块）

一次性告诉用户：

- 哪些资料已经存在；
- 建议开启哪些模块；
- 哪些模块资料部分存在或暂未发现；

第一次确认只允许展示以下六个用户模块，并且必须按此顺序、使用中文名称编号：

1. 航班
2. 地图
3. 每日行程
4. 租车
5. To Do
6. 记账

内部配置映射固定为：航班=`modules.flights`、地图=`modules.overview`、每日行程=`modules.itinerary`、租车=`modules.driving`、To Do=`modules.todo`、记账=`modules.ledger`。不得向用户展示内部英文键，不得把记账写成 `Ledger`，也不得出现第七个模块。

门票不是独立模块：不编号、不单独确认、不写入 `config.modules`。门票资料是“每日行程”中的内容，有资料时显示在对应行程里；资料不足时，只在第二次确认中作为内容缺口说明；显示与隐藏始终跟随“每日行程”。

第一次确认输出后立即停止并等待用户回复。未收到明确回复前，不得进入第二次确认、写入旅行数据、构建地图或启动页面。没有资料不代表自动关闭，用户仍可保留模块并显示“待补充”。

地图只使用 `assets/maps/templates/manifest.json` 中登记的十张固定底图。普通生成不得临时绘制、生成或增加新模板；只有模板库维护任务才允许更新该目录与 manifest。

Agent 只确认模块；`scripts/build-map.mjs` 先根据地点经纬度、路线跨度、方向、密度和连通关系形成候选模板池，再根据由区域、地点与路线组成的旅行签名做稳定哈希，从候选池中确定性选择一张。不得要求用户选择地图风格。`trip-data.json > map.mapMode` 固定写为 `template-auto`，`map.templateId` 固定写为 `auto`；Builder 生成的 `routeMap.regions[].mapMode` 为 `frozen-template`。

高密度点位由 Builder 在统一安全区域内确定性疏散。经纬度只负责相对东南西北和距离关系，不追求真实比例；同一输入必须得到相同位置。

### STEP 4：第二次确认（真正的数据缺口）

只检查用户最终保留的模块，把所有缺失、冲突和歧义合并成一次确认。让用户选择：

- 现在补充；或
- 先生成，缺失处显示“待补充 / 待确认”。

不要重复询问已经明确的信息。少量缺失不得阻止生成；只标记缺失字段，不覆盖已经确认的事实。

收到用户对第二次确认的明确回复后，先向用户发送以下说明，再继续 STEP 5。这只是进度提示，不构成第三次确认，也不需要等待用户再次回复：

> 首次生成需要 AI 阅读并整理你的旅行资料，再套用模板生成页面，因此会需要一定时间。简单行程通常几分钟到十几分钟即可完成；如果行程天数较多、涉及多个城市/国家或资料比较复杂，生成时间可能更长

### STEP 5：只写一份输入

只写入 `trip-data.json`：

- 从空白容器一次性写入本次旅行的完整内容，把 `trip.status` 从 `uninitialized` 改为 `draft`，并替换 `metadata.tripId` 与标题；
- `config`：六个模块开关、语言和本地优先持久化；
- `map`：地点经纬度、区域归属、地点顺序、总览路线与每日路线。

用户未提供的内容保持空数组，或仅在已启用模块中按现有规则标为“待补充 / 待确认”。不得把空白底板中的占位状态当成用户事实。

不要手写 `routeMap`、SVG path、地图坐标、路线颜色或标签样式。

### 首次写入字段速查

保留空白底板已有的容器键；模块关闭时保留空数组或 `null`，不要删除容器。首次生成至少遵守：

- `metadata` 写 `tripId`、`title`；`trip` 写 `status: "draft"`、起止日期、`dayCount`、国家和目的地区域。日期使用 `YYYY-MM-DD`。
- `days[]` 写 `day`、`date`、`title`、`locations[]`、`schedule[]`；行程项写 `id`、`time`、`type`、`text`，有对应数据时再加 `placeId` / `placeIds` / `ticketIds`。`dayCount` 必须等于 Day 数量。
- `accommodations[]` 可保留住宿记录；当前页面要显示的入住、退房和住宿文字仍写入对应的 `day.schedule[]`。
- 完整航班使用 `flightJourneys[]:{id}` 和 `flights[]:{id,journeyId,sequence,airline:{name或nameZh},flightNumber,departure:{airportCode,city,date,time,utcOffset},arrival:{同结构}}`。资料缺失时只写带 `placeholder:true`、`status:"pending"`、`missingFields[]` 的 Journey，不猜航班事实。
- `places[]` 写唯一 `id` 和 `name` 或 `nameZh`；`ticketPlanning.items[]` 用唯一 `id`、`day` / `dayId`、名称和 `requirement`，由行程项的 `ticketIds[]` 关联。
- `preTrip.packingItems[]` 写 `id`、`text`、`completed`；没有用户明确提供的 To Do 时保持空数组。
- 开启租车时，`rentalCar` 写 `company`、`rentalPeriodDays`、`vehicle:{example,class}`、`unlimitedKilometers`、`price:{currency,payAtCounter}`、`insurance[]`、`pickup:{date,time,location,address,utcOffset}`、`dropoff:{date,time,timeZoneLabel,vehicleReturnPoint,deadlineWarning,recommendedArrivalTime,utcOffset}`；同时保留租车检查、驾驶提醒和参考链接数组。
- 地图开启时填写 `region`、`places[]`、`routes[]`、`dailyRoutes[]`。地图地点使用唯一 ID，优先提供经纬度；路线的 `day` 对应已有 Day，`placeIds` 至少两个且必须存在。多目的地地点还需 `countryCode` 或 `mapRegionId`；Daily Map 需要交通图标时，用 `scheduleItems` 按相邻路线段关联行程项 ID 或索引。
- 地图关闭时三组地图数组可为空；地图开启时运行 Builder。Agent 不写 `routeMap` 或 `metadata.assets.routeMaps`。

Hero 标题与地图模式完全独立。固定规则只有两种：

- 国内旅行：`trip.primaryDestinationName` 保留用户资料中的主要目的地表述，例如“内蒙古”“成都”“新疆”；Hero 不显示“中国”；
- 国外旅行：Hero 根据 `primaryDestinationCountries` 显示国家名；多国之间使用 ` × `。

优先从旅行计划标题、路线主题或用户原文提取 `primaryDestinationName`，不要机械取第一个城市，也不要根据地图 Scope 改写它。资料没有明确目的地表述时，才回退到 `primaryDestinationCity` 或 `citiesAndAreas` 第一项。`trip.heroTitle` 仅作为用户后续明确 DIY 时的直接展示覆盖值。

### STEP 6：构建并轻量校验

```bash
npm run build:map
npm run validate
```

`build-map` 必须是唯一地图生成入口。它从 `trip-data.json > map` 读取地图输入，并把 Renderer 直接读取的 `routeMap` 写回同一份 `trip-data.json`。

`validate-lite` 只检查会导致页面失败或泄露的问题：JSON、基本行程、Day、模块数据或明确待补充、地图地点/路线、模板清单与所引用底图、明显 Secret，以及核心运行文件。

不要在普通生成中运行完整 Entity、18 类 Stable ID、provenance、migration、architecture 或 Framework Schema 校验。

### STEP 7：启动并快速检查

```bash
npm run preview
```

从本次预览进程输出的 `Travel plan local preview:` 后取得实际 URL，用该地址确认 HTTP 200 或页面正常载入，并在交付后保留此预览进程运行。默认从 4173 端口开始；端口占用时服务器会自动尝试后续端口。链接必须来自本次成功运行的进程，不能预设端口、复用旧任务地址或仅凭启动日志判断。内置浏览器已经打开也不能替代最终交付链接。

只检查数据可读取、页面能载入、已启用模块可见、地图已生成，且没有明显运行错误。只有内容无法识别、排版异常或存在明显歧义时，才补充页面级视觉检查；完整桌面/手机交互、逐项事实和边界场景验收需要时再执行。完成后停止。

## 地图硬边界

Agent 只提供地点、经纬度、顺序和每日路线。Builder 从十张固定底图中自动选择一张，并叠加固定路线、节点、标签、标题和日期图例。禁止调用图片生成模型画地图，禁止自行设定颜色、字体、线宽、圆点、图例、地形装饰或交通图标，禁止绕过 `scripts/build-map.mjs`。

地图只收录目的地内部行程。出发国、返程终点国和纯转机国家不属于本次目的地时，其机场与跨国飞行路线不得写入地图；例如深圳飞往苏黎世，只显示苏黎世及之后的瑞士境内路线。抵达机场位于目的地内部时必须保留，例如苏黎世机场到瑞士其他地点。

多国旅行必须在 `trip-data.json > map.regions` 中按目的地拆分，每个地点提供 `countryCode` 或 `mapRegionId`。Builder 为每个目的地生成独立 `routeMap.regions[]`，并删除跨区域连线；瑞士地点只出现在瑞士地图，罗马或意大利地点只出现在对应地图。不得把多个国家的全部地点压进同一张模板图。

Overview 最多显示核心地点，Daily 显示当天详细地点；二者必须共用同一底图、画布、比例与地点坐标。禁止 Day zoom、fitBounds、crop-to-day 或重新计算当天 extent。

普通旅行生成不得读取 Boundary Library、研究地图版权、下载轮廓或为某个国家另做新模板。旧 Boundary 和国家轮廓能力只作为 advanced/reference 保留。

## To Do 提取规则

To Do 只允许提取用户资料中明确写出的待办、备忘、提醒、准备事项或尚未完成的动作。不得根据常识自行补充证件检查、天气、换汇、网络、保险、行李、地图或其他建议。用户没有明确提供 To Do 时，`preTrip.packingItems` 写为空数组，保留输入界面供用户自行添加；这不属于阻止生成的数据缺口。

## 门票 PDF

用户提供门票 PDF 时，不修改源 PDF，只将获准使用的完整副本放入本次旅行的 `assets/tickets/`，并在对应 `ticketPlanning.items[].document` 写入相对 `url`、`type: application/pdf` 与用户可见 `label`。不得为了“安全”主动遮挡、裁切、打码或重新导出 PDF；只有用户明确要求时才处理其中内容。点击门票的“查看”按钮必须在现有门票 Dialog 内嵌 PDF，同时保留“在新窗口打开 PDF”作为浏览器不支持内嵌时的回退。没有 PDF 时继续显示现有文字说明，不伪造文件。

## 记账与 Runtime

记账直接复用 Golden 实现。普通使用固定为 `config.persistence.mode = "local"`，不需要数据库。只有用户明确要求多人共享或多设备同步时，才定向读取 `optional/cloudflare-d1/` 并启用用户自己的 D1；不得提交数据库 ID、Account ID、Token、Secret 或私人运行数据。

## 生成结束提示

完成本地检查后，按以下格式向用户交付并结束任务。把下面两处 `ACTUAL_URL` 替换成本次验证成功的完整本地 URL，绝不能原样输出占位符；即使页面已经在内置浏览器打开，也不能省略可点击链接。公开访问风险只在这个最终交付阶段提醒一次，不得提前放入资料分析或两轮确认。不要展开 GitHub、Cloudflare Pages 或 D1 教程，不要要求用户选择下一步，也不要暗示已经完成公网部署：

第一版旅行网页已生成完成，目前是本地可运行版本。

网页地址：[打开旅行网页](ACTUAL_URL)

本地地址：`ACTUAL_URL`

隐私提醒：当前是本地页面。如果以后公开部署，页面内容可能被任何人访问；是否移除或隐藏敏感内容、增加访问保护，由你自行决定。

后续如需上线或多人共享，可以继续配置：

本地网页 → GitHub（版本管理） → Cloudflare Pages（公网部署） → [可选] Cloudflare D1（多人共享数据）

D1 仅在需要多人 / 多设备共享记账、Todo、Ticket 等数据时使用。

后续具体配置可再自行与 AI 沟通。
