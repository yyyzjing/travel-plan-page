# Golden Viewport & Scenario Manifest

版本：Phase 0 / Round 1  
基线来源：Golden Version 线上正式版与 `golden-ui-spec.md`  
状态：定义未来截图入口；本轮不生成或提交截图文件。

## 1. 使用边界

- 本 manifest 只定义 Golden screenshot regression 的 viewport、状态、裁切目标和断言入口。
- Golden fixture 含私人旅行内容与 Ledger runtime data。未来截图及 trace 必须标记为 **INTERNAL / DO NOT PUBLISH**，不得直接进入公开仓库或公开构建产物。
- 地图视觉细节由`golden-map-spec.md`补充；公开Demo额外验证每个目的地国家都拥有独立总览和日期路线。
- 所有截图必须使用同一浏览器主版本、device scale factor `1`、同一字体环境、隐藏滚动条，并等待页面数据与共享状态稳定。
- 截图前不得修改 Golden 数据来“适配” viewport；数据变化应产生新的 fixture version。

## 2. Viewport Matrix

| Viewport ID | CSS viewport | DPR | 用途 |
|---|---:|---:|---|
| `mobile-390` | `390 × 844` | `1` | 主要窄屏 Golden baseline |
| `mobile-430` | `430 × 932` | `1` | 较宽手机、`>420px` Ledger 分支 |
| `desktop-1440` | `1440 × 900` | `1` | 720px content 与 1100px route layout |

## 3. 通用捕获前置条件

每次捕获必须：

1. 从正式入口重新载入，清除当前页临时交互状态，但不得清除 Golden D1 数据。
2. 等待 Hero、flight cards、route explorer、timeline、rental、todo 和 Ledger 初始化完成；loading error 必须隐藏。
3. 冻结当前时间或记录 capture timestamp。涉及 flight/rental countdown 的截图需使用约定 clock fixture，否则只断言布局，不断言数字文本。
4. 将水平 carousel/map scroll 置于场景指定位置。
5. 将页面 scroll 精确定位到目标容器；局部截图优先使用组件 bounding box，页面截图用于 section rhythm。
6. 同时保存：PNG、DOM selector contract、关键 computed styles、关键 bounds JSON。PNG 不是唯一判定依据。

## 4. 场景定义

以下每个场景都必须分别在 `mobile-390`、`mobile-430`、`desktop-1440` 捕获，共 27 个基本组合。

| Scenario ID | 页面状态 | 目标区域 | 必须可见 | 主要非像素断言 |
|---|---|---|---|---|
| `travel-top` | Travel 默认，scroll top 0 | Topbar + Hero + section transition | wordmark、Travel/Ledger nav、eyebrow、title、date | topbar sticky 48px；Hero mobile 188px / desktop 260px；content width |
| `flight` | Travel 默认，carousel 第 1 卡居中 | Flight heading、首卡、dots | flight meta、airport flow、time/status/countdown | card basis、330/350px min-height、14px gap、active dot |
| `trip-overview-country-1` | Route第一个国家，Overview active | Route heading、国家/日期tabs、map container、utility、caption | 第一国asset、全部本国routes/points/legend | mobile content width；desktop route 1100px；map overflow mode |
| `trip-overview-country-2` | Route第二个国家，Overview active | 国家/日期tabs、第二国map container | 第二国asset、全部本国routes/points/legend | 与第一国不串用asset/routes；切换后回到Overview |
| `daily-itinerary` | Golden Day 3 展开，其余关闭 | Day 3 toggle、daily map入口、schedule、ticket/map button | timeline line/points、time、text、tag/button/ticket | day card 48px left rail；item 82px left padding；expanded detail |
| `rental` | Travel rental 默认 | Heading、deadline、countdown、details、drive tabs | status/deadline/timer、car/stops/price | 24px panel radius；deadline/countdown/details stacking；desktop stops两列 |
| `todo` | Todo 默认稳定状态 | Heading、progress、form、list或empty | input、add、existing items/empty | 48px controls、13px radius、54px item、complete/delete states |
| `ledger-home` | `#ledger`，Entry tab active，无 dialog | Header、tabs、members、bill form、bill list | amount/currency/category/date/participants/buttons | 720px app、entry padding breakpoint、6-column participant grid |
| `ledger-stats` | `#ledger-stats`，member cards维持 Golden 默认 open 状态 | Stats summary、settlement、member cards | transfer rows、metrics、net balances | 17px cards、84px transfer、78px summary、3-column metrics |
| `ledger-dialog` | Ledger Settings dialog open | backdrop + complete dialog | header/close、base currency、common chips、add currency | dialog width/max-height/radius/shadow；390实测352px宽 |

## 5. 每个 Viewport 的必拍清单

### 5.1 `mobile-390` — 390 × 844

- `mobile-390__travel-top.png`
- `mobile-390__flight.png`
- `mobile-390__trip-overview.png`
- `mobile-390__daily-itinerary.png`
- `mobile-390__rental.png`
- `mobile-390__todo.png`
- `mobile-390__ledger-home.png`
- `mobile-390__ledger-stats.png`
- `mobile-390__ledger-dialog.png`

已取得、未来可用于 bounds JSON 的 **[GOLDEN FIXTURE MEASUREMENT]** 摘要：

- Topbar `390×48`；Hero `390×188`；H1 `x18 y132.547 w354 h45.859`。
- 首 flight card `x18 y331 w334 h330`。
- Overview map shell `x18 y944 w354 h266`。
- 首 day toggle `x66 w306 h78`。
- Rental panel `x18 w354 h759.023`。
- Todo form `x18 w354 h48`。
- Ledger entry card `x18 w354 h704.984`；amount controls `h44`；primary `w322 h48`。
- Settings dialog `x19 w352 h423.297`。

### 5.2 `mobile-430` — 430 × 932

- `mobile-430__travel-top.png`
- `mobile-430__flight.png`
- `mobile-430__trip-overview.png`
- `mobile-430__daily-itinerary.png`
- `mobile-430__rental.png`
- `mobile-430__todo.png`
- `mobile-430__ledger-home.png`
- `mobile-430__ledger-stats.png`
- `mobile-430__ledger-dialog.png`

已取得、未来可用于 bounds JSON 的 **[GOLDEN FIXTURE MEASUREMENT]** 摘要：

- Hero `430×188`；H1 computed font-size `51.6px`。
- 首 flight card宽 `374px`、高 `330px`。
- Daily map shell `x18 w394 h296`。
- Golden Day 3 card `x18 w394 h760.008`；detail `x66 w346 h650.117`。
- Schedule map button `h32`；ticket `h58`。
- Rental panel宽 `394px`、高约 `748.445px`。
- Todo form宽 `394px`。

### 5.3 `desktop-1440` — 1440 × 900

- `desktop-1440__travel-top.png`
- `desktop-1440__flight.png`
- `desktop-1440__trip-overview.png`
- `desktop-1440__daily-itinerary.png`
- `desktop-1440__rental.png`
- `desktop-1440__todo.png`
- `desktop-1440__ledger-home.png`
- `desktop-1440__ledger-stats.png`
- `desktop-1440__ledger-dialog.png`

已取得、未来可用于 bounds JSON 的 **[GOLDEN FIXTURE MEASUREMENT]** 摘要：

- Topbar水平 content padding `360px`；Hero `x360 w720 h260`。
- Hero H1 `w620 h62.719`、computed font-size `64px`。
- 首 flight card `w619.195 h350`。
- Route section `x170 w1100`；map shell `x170 w1100 h825.5`。
- Itinerary `x360 w720`；首 toggle `x408 w672 h78`。
- Rental panel `x360 w720 h660.578`。
- Todo form `x360 w720 h48`；Footer `x360 w720 h126`。

## 6. 可选补充场景（不属于本轮最低完成条件）

后续视觉回归可增加：

- `flight-second-card`、`flight-last-card`
- `daily-itinerary-closed`
- `ticket-pending`、`ticket-complete`
- `todo-item-default`、`todo-item-complete`、`todo-empty`
- `ledger-currency-dialog-result`、`ledger-currency-dialog-empty`
- `ledger-members-dialog`
- `ledger-bill-edit`、`ledger-note-inline-edit`
- `loading-error`
- `place-map-sheet`
- `reduced-motion`

这些场景不得替代 27 个基本组合。

## 7. 回归判定

- **Computed style：严格**。font-size、weight、line-height、letter-spacing、padding、gap、border、radius、shadow、display、grid/flex、overflow、position 必须匹配规范；浏览器序列化等价值允许归一化。
- **Bounds：严格但允许亚像素容差**。整数布局容差建议 `≤0.5px`，由字体 metrics 导致的文字 bounds 需单独标注平台基线。
- **Screenshot：感知差异辅助**。不得因字体抗锯齿少量差异失败，也不得用较宽像素阈值掩盖真实 padding/radius/layout 变化。
- **动态数字：结构严格、文本按 clock fixture**。未冻结时钟时，对 countdown 只比较 font/layout，不比较数字内容。
- **内容高度：fixture-specific**。只对当前 Golden data version 的页面总高度和内容驱动高度进行比较。
