# Golden Contract

状态：Public Template Guardrail  
原则：**Reuse, not recreate.**

本文件是未来Agent修改模板前必须先读取的合同。Golden Version原代码是视觉、行为与算法的事实来源；公开仓库不包含其私人Trip Data和Custom Map Fixture。

## Current Product Direction

当前目标是 **data-driven Standard Travel Generator**。每份用户材料都经过相同的两轮确认与构建流程，先交付本地标准预览；个性化改版、线上部署和云端共享分别属于后续任务。

- 普通单次旅行生成只允许更改 `trip-data.json`和该 Trip 获授权的 assets；历史 canonical 流程仅作 advanced 兼容保留。
- HTML、CSS、JavaScript、Schema、validator、Function、migration、Skill和references均为Core；单次生成不得修改。
- `source-facts.json`与原始PDF/图片/订单必须位于发布仓库之外。
- 六个用户模块由 `trip-data.json > config.modules` 控制，不通过删除section、导航或初始化代码实现。
- 地图从十张固定模板中自动选择；地点投影、路线、Daily layout 和 pins 由 Builder 从 `trip-data.json > map` 确定性派生，不由 Agent 逐点手画。
- 本地浏览器存储是默认运行方式；D1只在用户明确要求多人/多设备共享时启用，并且必须属于该用户。
- 隐私安全、Golden UI、成熟交互与Ledger算法仍是强制边界。

普通单文件生成的权威顺序与输出边界见根目录 `SKILL.md`。

## Contract Authority

视觉事实来源依次是：Golden production code、实际DOM/computed style/rendering、`golden-ui-spec.md`。截图只用于回归，不能用来重新估算CSS。

行为与算法分别由`golden-behavior-spec.md`和`golden-ledger-spec.md`展开。发现文档与代码冲突时应定向验证并记录，不得自行选择“更漂亮”或“更通用”的结果。

## [FROZEN UI]

未经用户明确批准，不得改变：

### Design Tokens

- paper、surface、ink、muted、line、lake、lake-soft、forest、terracotta、warning及组件级辅助色；
- Apple/PingFang/Hiragino/Microsoft YaHei系统字体栈和现有monospace栈；
- 字号、字重、line-height、letter-spacing；
- `720px`主content width；
- `24px/16px`主圆角层级及组件既有圆角；
- 主阴影、Ledger surface/dialog/card阴影；
- 页面纹理、surface和border视觉。

### Layout and Responsive

- Topbar高度、sticky、safe-area、对齐和backdrop blur；
- Hero移动/桌面高度、padding和type scale；
- 主内容列、route宽版布局、mobile gutter；
- section rhythm、heading/footer spacing；
- 当前breakpoints、carousel、map scroll和overflow边界；
- `390×844`、`430×932`、`1440×900` baseline下的结构与响应结果。

### Components

- Flight carousel/card、airport flow、status、countdown和dots；
- Trip Overview、route tabs、map shell、utility和caption；
- Daily timeline、accordion、schedule、map button、Ticket、note和cost tag；
- Rental deadline/countdown/details和三个notes tabs；
- Todo form/list/check/delete/empty；
- Footer、Travel/Ledger navigation、active/dropdown states；
- place map overlay、map fullscreen、loading/error states；
- Ledger header、tabs、traveler avatar、bill form/list、stats、settlement、dialogs、buttons、inputs与empty states。

完整数值见`golden-ui-spec.md`。公开Demo内容造成的页面绝对x/y不是通用硬编码规则。

## [FROZEN BEHAVIOR]

### Navigation

- Travel与Ledger互斥显示，hash/active/hidden/inert/skip-link同步。
- view切换保存各自内存scroll position；section link滚动到目标。
- Travel menu外部点击关闭；Google Maps和reference links安全地在新context打开。

### Flight

- carousel横向snap，active card由中心距离判断。
- Journey由ordered flights组成；future departure、in-flight arrival、completed状态语义保持。
- precise countdown每秒刷新，跨日显示规则保持。

航班的 departure 与 arrival 分别使用各自端点数据中的 `utcOffset` 解析，不从机场代码推导。新 Trip 必须为两个端点提供合法 offset；字段缺失时当前兼容回退为 `+00:00`，不得把该回退当作已确认的旅行事实。

### Daily Itinerary

- 初始只展开匹配当前旅行日的Day；无匹配则全部关闭。
- Accordion单开，点击已展开项可全部关闭。
- Schedule保持数据顺序，显示time/text/ticket/map links/note/cost。
- 地点overlay支持body lock、close/backdrop/Escape、focus return和主要control Tab循环。

### Ticket and Todo

- Ticket pending/purchased、requirement、day summary和同ID实例同步保持。
- Todo trim空值不新增；新增、完成、取消、删除、progress与empty state保持。
- 默认在当前浏览器本地保存，不请求共享API。
- 用户明确启用D1并列入`sharedCollections`时才共享；保存失败的当前限制见Known Issues，不把bug冻结为理想规则。

### Rental and Map

- Rental pickup前、使用中和return后的三阶段倒计时语义保持。
- deadline、urgent state、每秒更新和三个notes tabs保持。
- Map国家切换、Overview/Day、place/transport popover、Google Maps和fullscreen入口保持。
- `routeMap.regions[]`中的每个目的地国家拥有独立总览、底图和本国日期路线；Core只渲染明确数据，不从display text猜测国家。

### Ledger

- Traveler CRUD、重复姓名检查、referenced-delete限制保持。
- Bill create/edit/delete、inline note、payer/participants、currency/base amount交互保持。
- Entry/Stats tabs、keyboard、draft、empty states和notice语义保持。
- 普通CRUD在save成功后提交本地Ledger state；mutation在单浏览器内串行。

## [FROZEN ALGORITHM]

未经用户明确批准，Ledger不得重写或改变：

- 金额输入只接受正数与最多两位小数；
- 所有金额、split、balance和settlement使用integer cents；
- foreign bill保留original与manual converted base amount；
- equal split使用`floor(total/participantCount)`；
- remainder按`participantIds`顺序逐人分配，每人最多多1 cent；
- paid、owed、net balance定义；
- minimum-transfer settlement的debtor/creditor确定性顺序；
- Avatar initial/color与Traveler identity规则。

回归输入与精确预期见`golden-ledger-spec.md`及`tests/golden-baseline/ledger-regression-cases.md`。

## [FROZEN MAP STYLE]

所有标准生成地图应继承：

- 由 manifest 登记的十张固定 WebP 底图及其安全区域；
- paper/terrain/water的低饱和region artwork语言；
- responsive SVG和当前map viewport surface；
- route双stroke：主色`7`、白色高光`2/.22`、round cap/join；
- Golden六色route palette；
- Overview marker `r=10.5`、浅色2.5描边；
- mixed serif/Kaiti place label、`700`、深蓝、0.4描边及generated anchor/size；
- heading和transparent date legend视觉；
- white/route-color rounded transport pins与line icons；
- current route tabs、utility、popover、fullscreen和responsive behavior；
- Overview全route、Daily仅selected route的composition。

详见公开安全版`golden-map-spec.md`。目的地geometry与文字可变，视觉语法不随意改变。

## [GENERATED TRIP ASSET]

下列内容属于每个用户自己的Trip构建结果，而不是公共模板常量：

- 由指标候选池与旅行签名稳定哈希选出的 template ID 与 base image 引用；
- 从 map Place、route 与 Day 引用生成的 route SVG paths；
- 投影后的place位置与自动label layout；
- daily layouts和transport positions；
- geographic annotations、heading、legend placement；
- destination queries、私人地址、地图option和特殊图像。

这些值由标准map generator生成并验证，Agent不得在单次旅行任务中手工修改坐标、SVG path或Renderer。

私人Golden Map Package的实际assets、routes、dates、coordinates、queries和place list已从Public Template移除。不得尝试从历史文档、截图或私人目录重新复制。

普通生成只使用 `assets/maps/templates/manifest.json` 登记的十张固定底图；旧 Boundary、`country-golden` 与 `generic-diagram` 能力只作为 advanced/legacy 参考保留，不属于普通生成链路。

## [TRIP CONFIG AND DATA]

`trip-data.json` 是普通生成中旅行内容、`config` 与 `map` 输入的唯一权威来源；`routeMap` 由 Builder 写回同一文件。该文件必须通过轻量 Schema 与 `validate-lite`。

- Config中的六个module值只来自第一轮确认；门票跟随每日行程，不是第七个开关。
- Data只来自用户材料、两轮确认和可验证的派生结果；普通生成不建立 source-facts 或 canonical 中间文件。
- Place、Day Item、Ticket、Transport和Map使用stable ID与typed references，不依赖显示文字、array index或substring建立身份。
- 旅行摘要、地图布局、pending count等可计算内容由build/renderer派生，不作为第二份人工事实源。
- 未确认事实用明确issue/status表达，不以虚构值补齐。
- Runtime Todo、Ticket completion和Ledger不写回静态Trip Data。

### Authoritative Rules

- `metadata.tripId`是页面与runtime namespace的唯一Trip ID；HTML不得维护第二份。
- `trip.primaryDestinationCountries`是 Agent 确认后的目的地国家清单；`config.modules.overview=true`时，每个 code 必须有一个对应的 `routeMap.regions[]` Map Package。
- 出发地或纯转机国家默认不生成地图；跨境日可以同时出现在两个Map Package中，分别呈现当地段落。
- Rental provider从Data渲染，不在HTML写真实品牌。
- Day Item、Ticket、Place、Transport与Map必须通过稳定ID引用；改变显示文案不得改变关联。
- Map Package只能由map generator从 `trip-data.json > map` 派生，不手写 `routeMap`。
- 精确事件时间应带当地日期、时间和offset/timezone信息；不要假设所有地点同一时区。
- Todo、Ticket completion与Ledger是Runtime State，不写入公开Demo事实。

普通单文件数据边界以 `schemas/trip-data.schema.json` 与 `validate-lite` 为准；`travel-data-contract.md` 仅作 advanced/canonical 兼容参考。

## [STABLE REFERENCE]

- 已有ID不得因显示名称、语言、日期或排序改变而重新生成。
- 新ID必须清晰、唯一、稳定且不包含私人敏感信息。
- 任何Core-facing关系不得使用substring、schedule/day数组位置、display name或SVG child顺序充当identity。
- validator必须拒绝悬空、错误类型或重复引用。

命名约定见`stable-id-proposal.md`。

## [RUNTIME STATE]

当前Runtime State包括：

- travelers与bills；
- Todo items；
- Ticket completion；
- 用户修改后的Ledger settings。

默认由当前浏览器localStorage按Trip ID保存；localStorage不可用时退回当前标签页内存。只有`persistence.mode="d1"`且collection列入allowlist时才访问Pages Function/D1。D1不应保存静态Travel Data、私人PDF、票据原件或源文件。

## [PRIVACY]

Public Template不得包含：

- 真实Trip Data或Trip ID；
- 酒店地址、完整私人路线、真实日期/金额/订单；
- Ticket PDFs、订单截图、源文档或私人D1导出；
- secrets、tokens、private keys或真实Cloudflare identity；
- 私人Golden地图assets、geometry、coordinates或queries；
- 未获授权的照片、地图或字体。

Demo必须完全虚构或明确获准公开。`.gitignore`不是历史清理工具；如果私人文件曾被commit，创建新的干净Public Repo。

## Change Control

只有独立框架维护任务才可以改变Frozen设计或产品行为，并且必须：

1. 先说明拟改变的Frozen合同。
2. 将架构修改与视觉/行为修改分开。
3. 对相关viewport、interaction和Ledger cases回归。
4. 更新对应spec与baseline。
5. 无法确认时停止并记录，不顺手修复潜在bug。

单次生成的默认验收目标始终是：**Immutable Core + Confirmed modules + Verified facts + Generated maps + Local-first preview + Private sources excluded.**
