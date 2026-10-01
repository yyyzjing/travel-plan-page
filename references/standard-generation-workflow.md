# Standard Generation Workflow

状态：保留的 advanced/canonical 流程；普通单文件生成以根目录 `SKILL.md` 为准。  
范围：从用户材料到本地标准预览；不包含个性化改版、公开部署或云数据库配置。

## 1. Outcome

一次生成必须产出可在本地打开的标准旅行网页，同时满足：

- 用户只需要做两轮集中确认；
- 单次旅行只替换配置、事实数据和该旅行资产；
- 页面结构、视觉、交互和 Ledger 算法来自冻结 Core；
- 缺失材料不会阻断预览，也不会被猜测；
- 原始材料和提取中间结果不会进入发布目录；
- 无网络、无 Cloudflare、无 D1 时，启用的本地功能仍可使用；
- 生成耗时可以按阶段解释和复现。

## 2. Directory and privacy boundary

### Private work directory

放在发布仓库之外，由当前用户单独控制：

```text
<private-work-dir>/
├── source-files/          原始 PDF、图片、票据、订单等
├── source-facts.json      一次提取后的结构化事实与来源
├── canonical-travel-data.json  确认后的规范化构建输入
└── working-notes/         可选的临时 OCR、消歧和检查记录
```

这些文件不得复制到模板、公开仓库、Demo、Skill、references、测试 fixture 或共享缓存。绝对路径也不得写入发布数据。

### Publishable trip directory

单次生成只允许改变以下类别：

```text
trip-config.json           模块与持久化模式
travel-data.json           编译后的Renderer数据
assets/...                 本次旅行获授权使用的资产
reports/...                不含原始材料或秘密的生成/校验报告
```

其余文件视为 Core 或框架工具。生成前后由 `schemas/core-integrity.json` 和 validator 比对。发生不一致时停止并报告；不得运行 `freeze` 将意外改动登记为正常。

## 3. Stage A — extract facts once

优先读取 PDF 的文字层；只有无文字、表格错位、图像承载关键信息或低置信度页面才做视觉/OCR检查。不要反复从头阅读同一份材料。

将结果写入仓库外的`source-facts.json`，其结构由`schemas/source-facts.schema.json`定义。至少保留：

- `sourceDocuments`及文档ID、media type、页数；
- 每条事实的`sourceRefs`，指向文档页码或用户确认；
- `issues`中的`missing-material / contradiction / uncertain / privacy-review`类型；
- issue的`open / resolved / accepted-for-preview`状态；
- `confirmations.moduleSelection`与`confirmations.missingMaterials`两轮结果。

若提取置信度不足，将其登记为`uncertain` issue，而不是增加Schema之外的自由字段。

提取阶段不生成 HTML，不画地图，不连接数据库，也不改模板。

## 4. Round 1 — module confirmation

事实提取完成后，一次性向用户展示七个模块。可以标注“材料中已检测到 / 未检测到”，但最终开关由用户决定。

| Config key | 用户看到的模块 | 关闭后的行为 |
|---|---|---|
| `flights` | 航班 | 不渲染、不导航、不初始化倒计时 |
| `overview` | 旅行总览与路线地图 | 不渲染国家总览或路线地图 |
| `itinerary` | 逐日行程 | 不渲染 Timeline 或每日入口 |
| `tickets` | 门票 | 不渲染票据状态或打开入口 |
| `todo` | Todo | 不渲染或初始化 Todo |
| `driving` | 自驾 | 不渲染租车、还车倒计时或驾驶提醒 |
| `ledger` | 记账 | 不渲染或初始化 Ledger |

把确认值写入 `trip-config.json > modules`。配置结构由 `schemas/trip-config.schema.json` 验证。

Ticket卡片嵌在逐日行程中，因此`tickets=true`要求`itinerary=true`。在Round 1清楚说明这个依赖，并在进入Round 2之前解决冲突；不要等生成失败后再追加一轮提问。

关闭模块只能通过 Config 生效。禁止为某个用户删除 section、导航、事件处理器或初始化代码。第一个可见 section 和导航顺序由 Core 根据已启用模块自动决定。

## 5. Round 2 — missing-material decision

只检查已启用模块。把所有缺失、矛盾或歧义合并成一次清单，每项说明：

- 缺什么；
- 影响哪个模块或哪条事实；
- 是否阻止可靠显示；
- 继续预览时会怎样表示。

然后只让用户决定：

1. **现在补充材料**：等待用户一次性补充，再合并进同一份 `source-facts.json`；
2. **继续生成预览**：把问题记录为 accepted/open，并用“待补充 / 待确认”状态完成页面。

选择预览后，禁止：

- 用常识、搜索结果或相似订单补写未知事实；
- 把多个候选地点压成一个泛化城市点；
- 因一个交通班次未知而删除已知起点、终点或途经点；
- 为了让校验通过而删除用户已确认的信息；
- 在生成过程中拆成第三、第四轮零散确认。

只有当缺失项会导致安全风险、无法确定同名地点国家/城市，或无法生成任何有效结果时，才再次阻塞并说明原因。

## 6. Stage B — canonical trip data

根据两轮确认生成：

```json
{
  "$schema": "./schemas/trip-config.schema.json",
  "schemaVersion": "1.0.0",
  "modules": {
    "flights": true,
    "overview": true,
    "itinerary": true,
    "tickets": true,
    "todo": true,
    "driving": true,
    "ledger": true
  },
  "persistence": {
    "mode": "local"
  }
}
```

上例只说明字段结构；每个模块的布尔值必须来自 Round 1，不能把示例值当作用户选择。

先在仓库外生成`<private-work-dir>/canonical-travel-data.json`。它应遵守`references/travel-data-contract.md`和`schemas/travel-data.schema.json`支持的canonical形状：

- 一个事实只有一个权威来源；
- Place、Day、Day Item、Ticket、Transport 等使用稳定 ID；
- 日程通过 ID 引用地点、票务和交通，不用显示文字或数组位置充当关系；
- 文字只是展示内容；
- Todo、Ticket 勾选状态和 Ledger 账目不进入静态旅行事实；
- 未确认字段保留明确状态，不伪造成已确认值。

已保留但材料不全的航班必须写成 `status="missing"` 的 typed placeholder，包含 `title + missingFields + issueIds`，不填写猜测的起降信息。已保留但没有票据文件的 Ticket 保留为 `materialStatus="missing"`。这两种状态都是第二轮“继续预览”的标准输出，不是校验逃生口。

## 7. Stage C — standardized maps

### Required inputs

每个保留的目的地国家需要：

- 用户有权使用的国家边界 GeoJSON，并记录来源与许可；
- `trip.primaryDestinationCountries[]` 中的 ISO 3166-1 alpha-2 code；
- canonical Places 中的 `countryCode` 与 `geo.lat/lng`；
- Days 和 Day Items 对 Place/Transport 的明确引用；
- 已确认的访问顺序。

不要从显示文案猜国家或地点，不要从私人 Golden 地图反推 geometry，也不要用手写贝塞尔曲线替代真实国家轮廓。

### Generation

```bash
node scripts/generate-map-package.mjs \
  --boundary /absolute/path/to/authorized-country-boundary.geojson \
  --data /absolute/path/to/private/canonical-travel-data.json \
  --country <ISO2> \
  --out assets/maps/<country>-region.json \
  --source <BOUNDARY_SOURCE_OR_URL> \
  --license <BOUNDARY_LICENSE>
```

生成器负责：

- 把准确国家边界投影到固定 `1448×1086` 画布；
- 输出 Golden 风格底图 SVG，而不是临时卡通轮廓；
- 从 canonical geo Places 投影地点；
- 按引用顺序生成 Overview route；
- 按 Day 生成 `dailyLayouts`、路线和 transport pins；
- 为每日地点计算带padding的viewport，使城市内行程使用城市尺度，而不是整国尺度；
- 输出确定性的默认标签信息；当前不承诺完整的自动collision求解；
- 记录边界来源、许可和生成参数，便于安全复用与复现。

自动路线表达的是地点之间的行程关系，不等同实时公交、步行或驾车导航。具体线路未确认时可以标记为待确认，但已知地点仍须显示。需要真实路网时，应作为用户明确要求的后续增强，不阻塞首版预览。

相同国家的纯边界/风格底图可缓存，但缓存不得包含任何用户路线、日期、地点、地址或 query。仅在 source、license、projection、canvas 和 style fingerprint 一致时复用。

### Compile to renderer data

Map generator输出 region package 后，使用固定 compiler 生成页面实际读取的 `travel-data.json`。`overview=true`时，每个目的地国家重复一次 `--region`；`overview=false`时省略 `--region`：

```bash
node scripts/compile-travel-data.mjs \
  --input /absolute/path/to/private/canonical-travel-data.json \
  --config trip-config.json \
  --region assets/maps/<country>-region.json \
  --out travel-data.json
```

Compiler负责把canonical entities/typed references与generated Map Packages转换为现有Renderer需要的只读shape。禁止手工复制字段、改Renderer适配本次Trip，或把private source provenance带入输出。

## 8. Stage D — tickets and runtime modules

- Ticket 有本地 PDF/图片且允许进入输出资产时，使用站内预览入口；不要把站内打开伪装成外部链接。
- 官方购买页属于外部链接，必须明确标识并安全地新开页面。
- 缺少票据文件时显示待补充，不生成无效 URL。
- Todo 只装载用户确认的初始准备事项；运行时新增、完成和删除属于本地状态。
- Driving 和 Ledger 只读取 Config；无数据或关闭时不修改 Core。
- Ledger 的 cents、平分余数、paid/owed/net 和最少转账算法不得因旅行生成而改变。

## 9. Stage E — validation and preview

运行：

```bash
node scripts/validate-generation.mjs check \
  --source /absolute/path/to/private/source-facts.json \
  --profile preview
```

`check` 是默认命令；需要机器可读结果时追加 `--json`。校验至少覆盖：

- Config/Data/Source Facts schema；
- 模块开关与数据、导航、初始化的一致性；
- stable ID 和 typed reference 完整性；
- 地图国家、地点、路线、Daily bounds 与许可记录；
- Core 文件未改变；
- 发布目录没有原始材料、秘密、Cloudflare identity 或私人工作路径；
- accepted uncertainties 有对应页面状态。

然后运行：

```bash
node local-preview-server.mjs
```

`local-preview-server.mjs`是纯静态 GET/HEAD 服务器，不提供 `/api/trip`，不写本地数据文件，也不连接 D1。可选 shared mode 的联调必须在用户明确选择 D1 后使用 Cloudflare 开发环境，不得把普通本地预览服务器当作 D1 adapter。

打开服务器输出的 `127.0.0.1` URL，验证：

- 第一个启用模块直接出现，无空 section；
- 所有启用模块可用，关闭模块没有 DOM 可见入口或后台请求；
- Overview 与每个 Day 的地点、顺序、范围正确；
- Ticket 站内入口、Todo 和 Ledger 本地保存可用；
- 移动端和桌面端无明显溢出或交互失效。

发布前另运行 `--profile publish`。它是发布准备检查，不代表已经部署。

## 10. Persistence boundary

默认：

```json
{
  "persistence": {
    "mode": "local"
  }
}
```

本地模式不访问 `/api/trip`，不要求 Cloudflare，且不能显示“未绑定 D1”错误。Todo、Ticket 状态、Ledger 同行人、账单和设置按 Trip ID 保存在当前浏览器；浏览器存储不可用时可退回本标签页内存。

D1 只用于用户明确选择的多人员、多设备共享。启用方式、限制与权限边界见 `deployment-guide.md`。静态页面存在 Ledger 并不意味着需要数据库。

## 11. Performance budget

不计算等待用户回复的时间：

| Stage | Target |
|---|---:|
| PDF 文字提取与结构化 | 1–2 分钟 |
| 两轮结果合并与 canonical data | 约 1 分钟 |
| 已准备/可复用国家边界地图 | 1 分钟内 |
| 新国家边界、投影和地图包 | 2–4 分钟 |
| 校验与本地浏览器检查 | 1–2 分钟 |

常见任务目标 3–6 分钟；首次新国家目标 5–10 分钟。如果超过 10 分钟，必须报告当前 stage、耗时、阻塞输入和下一步，不得静默重新设计页面或反复手工调整地图。

## 12. Handoff contract

交付首版预览时，最终消息必须明确：

1. 已启用/关闭模块和仍待补充内容；
2. 本地预览地址与校验结果；
3. “该地址只在本机预览服务运行时可访问，目前没有公开部署”；
4. 发布需要另走 GitHub + Cloudflare Pages 流程；
5. 普通本地使用和静态发布不需要数据库；
6. 多人、多设备共享 Ledger/Todo/Ticket 时，用户需明确启用并绑定自己的 Cloudflare D1；
7. 未经这次单独授权，没有执行 Git push、Cloudflare 部署、D1 创建、migration 或 binding。

首版交付后，用户可以另开个性化优化阶段。该阶段的设计改动不得回写公共 Skill、Demo 或其他用户的模板。
