# Golden UI Specification

版本：Phase 0 / Round 1  
基线日期：2026-09-09  
视觉事实来源：Golden Version 的 `styles.css`、`ledger.css`、`index.html`，以及此前已完成的线上 DOM、computed style、`getBoundingClientRect()` 测量。

本文件只冻结页面视觉。地图内部路线、地点、标签、交通图标坐标和 custom artwork 细节以 `golden-map-spec.md` 为准。

## 0. 术语和判定优先级

- **[FROZEN STYLE]**：Golden Version 的设计规则。重构可以改变数据来源和模块边界，但未经批准不得改变这些值或等效视觉结果。
- **[GOLDEN FIXTURE MEASUREMENT]**：指定 viewport、指定 Golden 数据和指定 UI 状态下的实际渲染值，只用于回归测试，不得硬编码为通用 Core 布局。
- 同一选择器若在 CSS 中多次声明，以最终级联结果为准。例如 Ledger amount、participant grid、settlement card 的文件末尾 refinements 覆盖较早声明。
- 验收优先级：DOM contract → computed style contract → bounds/layout contract → screenshot。截图字体抗锯齿差异不能单独判定失败。

## 1. Global Design Tokens

### 1.1 颜色

| Token | [FROZEN STYLE] 值 | 用途 |
|---|---:|---|
| `--paper` | `#f3f6f2` | Travel 页面底色、时间线点内部底色 |
| `--surface` | `#ffffff` | 卡片、地图表面 |
| `--ink` | `#13262f` | 主文字、深色卡片、主按钮 |
| `--muted` | `#66757a` | 次要文字 |
| `--line` | `#d7dfdc` | 分隔线与默认边框 |
| `--lake` | `#287b90` | 主强调色、链接、选中态 |
| `--lake-soft` | `#d9ebee` | 浅强调背景 |
| `--forest` | `#516b55` | 完成态 |
| `--terracotta` | `#b65c3a` | Today、提醒强调 |
| `--warning` | `#b84635` | 错误与紧急状态 |

附加组件色同样属于 **[FROZEN STYLE]**，包括但不限于：flight card 的 `#eff8f8/#a9c3c8/#7599a0/#b8cccf/#9db7bc/#e0a983`；ticket 的 `#fff2ed/#f6e2d8/#eaf3e9`；Ledger 页背景 `#fafbf9`、负余额 `#c66b46`、结算金额 `#b04439`。重构不得只保留 token 而丢失这些组件级色值。

### 1.2 字体

- **[FROZEN STYLE] 全局字体栈**：`-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`。
- **[FROZEN STYLE] 等宽字体栈**：`ui-monospace, SFMono-Regular, Menlo, monospace`。
- **[FROZEN STYLE]** `body` 启用 `-webkit-font-smoothing: antialiased`。
- **[FROZEN STYLE]** 数字相关区域按现有组件启用 `font-variant-numeric: tabular-nums`；Ledger app 全局启用 tabular numerals。
- 浏览器 computed style 会把系统字体规范化为实际平台可用名称；这不是字体规则差异。

### 1.3 字号、字重、行高和字距体系

**[FROZEN STYLE]** 当前并非单一 modular scale，而是以下实际层级：

- Display：Hero `clamp(38px, 12vw, 64px)`，`820 / .98 / -.06em`；Ledger H1 `clamp(30px, 9vw, 42px)`，`820 / 1 / -.055em`。
- Section H2：Travel `30px / 1 / -.04em`；Ledger section `19px / 1.2 / -.025em`。
- Large numeric：flight code `clamp(25px, 8vw, 36px)`；flight countdown `clamp(22px, 7vw, 30px)`；rental countdown `clamp(28px, 9vw, 44px)`。
- Body：`12–14px`，常用 line-height `1.45–1.7`。
- Labels：`9–11px`，常用 weight `700–800`，letter-spacing `.05–.16em`。
- Control：`11–13px`，常用 weight `680–760`。
- 现有非标准数值字重（650、680、690、720、740、750、760、780、790、800、820）属于 **[FROZEN STYLE]**；不得在重构时擅自规整为 600/700/800。

### 1.4 尺寸、圆角、边框和阴影

- **[FROZEN STYLE]** 内容宽度：`--content: 720px`。
- **[FROZEN STYLE]** 主圆角：`--radius-lg: 24px`、`--radius-md: 16px`。
- **[FROZEN STYLE]** 主阴影：`0 16px 48px rgba(25, 47, 55, .08)`。
- **[FROZEN STYLE]** 常用控件圆角：`7/8/9/10/11/12/13/14/15/17/20px`；pill 使用 `999px` 或 `99px`；avatar 使用 `50%`。
- **[FROZEN STYLE]** 默认线宽为 `1px`；checkbox/timeline point 等使用 `1.5px/2px/3px` 的现有值。
- **[FROZEN STYLE]** Ledger surface：`1px solid rgba(19,38,47,.1)`、`16px` radius、双层 shadow `0 12px 32px rgba(18,42,50,.055), 0 1px 3px rgba(18,42,50,.035)`。
- **[FROZEN STYLE]** Ledger settlement/member cards 最终值：`17px` radius、`1px solid rgba(19,38,47,.08)`、`0 10px 26px rgba(18,42,50,.05)`。
- **[FROZEN STYLE]** Ledger dialog：`20px` radius、`0 22px 70px rgba(19,38,47,.2)`。

### 1.5 背景和页面网格

- **[FROZEN STYLE]** Travel `html` 背景为 `--paper`。
- **[FROZEN STYLE]** Travel `body` 为 `--paper` 加每 `32px` 一条的淡湖蓝横线：`linear-gradient(rgba(40,123,144,.035) 1px, transparent 1px)`。
- **[FROZEN STYLE]** Ledger view 与 Ledger active body 背景为 `#fafbf9`。
- **[FROZEN STYLE]** `box-sizing: border-box` 应用于所有元素。
- **[FROZEN STYLE]** main `overflow: hidden`；横向滚动只由 carousel/map 等指定容器承担。

### 1.6 Breakpoints、safe area 和间距节奏

- **[FROZEN STYLE]** Travel/Ledger 主桌面断点：`min-width: 700px`。
- **[FROZEN STYLE]** 宽地图断点：`min-width: 1000px`。
- **[FROZEN STYLE]** Ledger 小屏 refinement：`max-width: 420px`；极窄统计 refinement：`max-width: 360px`；导航 wordmark refinement：`max-width: 380px`。
- **[FROZEN STYLE]** `--safe-top`、`--safe-bottom` 使用 `env(safe-area-inset-*, 0px)`。
- **[FROZEN STYLE]** section 基本节奏：移动端 `44px 18px`；航班 section 为 `24px 18px 34px`；桌面仅将水平 padding 变为 0。
- **[FROZEN STYLE]** 主要重复间距：`4/5/6/7/8/9/10/12/14/16/18/20/22/24/26/28/30/44/48px`。这是一套实际使用的细粒度节奏，不应被替换为新 spacing scale。

### 1.7 Motion、focus 和 touch

- **[FROZEN STYLE]** `html { scroll-behavior: smooth; }`。
- **[FROZEN STYLE]** button/a 使用 `touch-action: manipulation`，interactive minimum target 多为 `44px`。
- **[FROZEN STYLE]** 通用 `:focus-visible` 为半透明 lake `3px` outline；button/a 的最终规则为 `2px solid var(--lake)`、offset `3px`。
- **[FROZEN STYLE]** carousel dot width、day chevron、packing progress/check 等使用 `.15–.2s ease`。
- **[FROZEN STYLE]** `prefers-reduced-motion: reduce` 时关闭 smooth scroll，将 transition/animation duration 压缩为 `.01ms`；Ledger view animation 和 avatar transition 关闭。

## 2. Travel Shell

### 2.1 Global / Body

- **[FROZEN STYLE]** body margin `0`，主文字 `--ink`；图片 `display:block; max-width:100%`。
- **[FROZEN STYLE]** skip link 固定定位，默认 top `-80px`，focus 时进入 safe area；深色背景、白字、`10px` radius、`12px 16px` padding、z-index `100`。

### 2.2 Topbar 与 Travel / Ledger Navigation

- **[FROZEN STYLE]** Topbar sticky：`top:0`、z-index `20`、高度 `calc(48px + safe-top)`、水平 padding `14px`、flex 两端对齐、垂直居中。
- **[FROZEN STYLE]** 背景 `rgba(243,246,242,.91)`，bottom border `rgba(19,38,47,.08)`，backdrop blur `16px`；Ledger active 时背景 `rgba(250,251,249,.93)`。
- **[FROZEN STYLE]** 桌面水平 padding：`max(24px, (100vw - 720px)/2)`。
- **[FROZEN STYLE]** Wordmark 最小高 `44px`、`12px/800/.06em`；次级 span muted、weight `600`。
- **[FROZEN STYLE]** Primary nav flex、gap `4px`；Travel summary 和 Ledger link 最小高 `44px`，`12px/680`，muted；current page 转 ink，并有 bottom `2px` lake indicator。
- **[FROZEN STYLE]** Travel menu 固定在 top `54px + safe-top`，宽 `min(420px, 100vw - 28px)`、padding `9px`、五列、gap `5px`、radius `15px`、白色 `.97`、blur `18px`、shadow `0 16px 44px rgba(19,38,47,.14)`。
- **[FROZEN STYLE]** menu item 最小高 `42px`、radius `9px`、`11px/690`、背景 `#f4f7f5`。
- **[FROZEN STYLE]** `≤380px` 时隐藏 wordmark 的 span，Travel summary 水平 padding 从 `9px` 变 `7px`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844`：Topbar `x0 y0 w390 h48`。
- **[GOLDEN FIXTURE MEASUREMENT]** `1440×900`：Topbar `x0 y0 w1440 h48`，左右内容 padding 计算为 `360px`。

### 2.3 Hero

- **[FROZEN STYLE]** 宽 `min(100%,720px)`、居中；移动 `padding:32px 18px 24px`、min-height `188px`、column flex、底部对齐。
- **[FROZEN STYLE]** Eyebrow：margin bottom `10px`、lake、`11px/800/.16em`。
- **[FROZEN STYLE]** H1：margin 0、max-width `620px`、`clamp(38px,12vw,64px)`、line `.98`、letter `-.06em`、weight `820`。
- **[FROZEN STYLE]** Date：margin top `14px`、mono `14px/650/1.4`、letter `.03em`。
- **[FROZEN STYLE]** `≥700px`：min-height `260px`、horizontal padding `0`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844`：Hero `x0 y48 w390 h188`；H1 `x18 y132.547 w354 h45.859`，computed font-size `46.8px`。
- **[GOLDEN FIXTURE MEASUREMENT]** `430×932`：Hero `x0 y48 w430 h188`；H1 computed font-size `51.6px`。
- **[GOLDEN FIXTURE MEASUREMENT]** `1440×900`：Hero `x360 y48 w720 h260`；H1 `x360 y187.688 w620 h62.719`，computed font-size `64px`。

### 2.4 Main Container、Section、Section Heading

- **[FROZEN STYLE]** Hero/section/footer 宽 `min(100%,720px)` 且 margin-inline auto。
- **[FROZEN STYLE]** Section `padding:44px 18px`、scroll-margin-top `48px`；`≥700px` horizontal padding `0`。
- **[FROZEN STYLE]** Heading margin-bottom `16px`、flex 两端、align-end、gap `16px`。
- **[FROZEN STYLE]** Section H2：margin 0、`30px/1/-.04em`。
- **[FROZEN STYLE]** Kicker 与 Hero eyebrow 相同；section index/soft label 为 muted mono `11px/700/1`、letter `.08em`。

## 3. Flights

### 3.1 Flight Section 与 Carousel

- **[FROZEN STYLE]** Flight section top/bottom padding `24px/34px`。
- **[FROZEN STYLE]** Carousel flex、gap `14px`、horizontal auto overflow、mandatory x snap、hidden WebKit scrollbar、contain overscroll、padding `2px 0 14px`。
- **[FROZEN STYLE]** Card flex-basis `calc(100% - 20px)`；`≥700px` 为 `86%`。snap align center。
- **[FROZEN STYLE]** Dots centered、gap `7px`；dot `6×6px`、inactive `#aebbb8`；active width `22px`、pill、lake；width transition `.2s ease`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844`：Flight section `x0 y236 w390 h479`；heading `x18 y260 w354 h53`；carousel `x18 y329 w354 h346`；首卡 `x18 y331 w334 h330`；dots `y675 h6`。
- **[GOLDEN FIXTURE MEASUREMENT]** `430×932`：首卡 `x18 w374 h330`。
- **[GOLDEN FIXTURE MEASUREMENT]** `1440×900`：Flight section `x360 y308 w720 h499`；carousel `w720 h366`；首卡 `x360 y403 w619.195 h350`。

### 3.2 Flight Card、Time、Airport、Status、Countdown

- **[FROZEN STYLE]** Card min-height `330px`、padding `20px`、radius `24px`、ink background、`#eff8f8` text、主 shadow、column flex；桌面 min-height `350px`。
- **[FROZEN STYLE]** Top meta：mono `11px/700/1.3`、letter `.08em`、`#a9c3c8`；airlines margin top `7px`、`10px`、`#7599a0`。
- **[FROZEN STYLE]** Flight flow grid columns由现有 `--route-columns` 决定，margin top `17px`、align start。
- **[FROZEN STYLE]** Airport code：white、mono `clamp(25px,8vw,36px)/760/1`、letter `-.05em`；首末分别 left/right，中间 center。
- **[FROZEN STYLE]** City min-height `30px`、margin top `5px`、`11px/1.25`、`#b8cccf`。
- **[FROZEN STYLE]** Route dot `9×9px`、`2px #8fc6d0` border、圆形、ink background；segment 从 padding-top `53px` 起，线为 `1px rgba(143,198,208,.5)`。
- **[FROZEN STYLE]** Timing `9px/1.3`、gap `3px`、`#9db7bc`；重点时间 `10px/720`、`#eff8f8`；跨日/强调 `#e0a983`。
- **[FROZEN STYLE]** Countdown row margin-top auto、padding-top `18px`、top border `rgba(255,255,255,.16)`。
- **[FROZEN STYLE]** Countdown label `11px #a9c3c8`；value white mono `clamp(22px,7vw,30px)/760/1.1`、letter `-.03em`、tabular numerals。

## 4. Trip Overview、Route Tabs 与 Map Shell

### 4.1 Trip Overview / Route Section

- **[FROZEN STYLE]** 默认遵循 720px section；`≥1000px` 时 route section 宽 `min(1100px,100vw - 64px)`，取消 max-width，以 `left:50% + translateX(-50%)` 居中。
- **[FROZEN STYLE]** Route caption margin `12px 4px 0`、muted、`12px/1.6`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844`：Route `x0 y715 w390 h626.891`；region tabs `x18 y828 w354 h32.5`；day tabs `x18 y870.5 w354 h63.5`；map shell `x18 y944 w354 h266`；utility `x18 y1215 w354 h32.5`；caption `x22 y1259.5 w346 h38.391`。
- **[GOLDEN FIXTURE MEASUREMENT]** `430×932` daily state：Route `x0 y715 w430 h637.695`；daily map `x18 y944 w394 h296`。
- **[GOLDEN FIXTURE MEASUREMENT]** `1440×900`：Route `x170 y807 w1100 h1134.195`；map shell `x170 y1003 w1100 h825.5`。

### 4.2 Route Tabs、Map Container、Header 与 Controls

- **[FROZEN STYLE]** Region/day tab rows flex、wrap、align center、gap `5px`、margin-bottom `10px`。
- **[FROZEN STYLE]** Tab button transparent、border 0、radius `6px`、`13px` 与 `7px 10px`；day tab为 `12px` 与 `7px 8px`。
- **[FROZEN STYLE]** Active region 为 ink background/white；active day 为 white + inset `1px --line`；day color dot `6×6px`、margin-right `5px`。
- **[FROZEN STYLE]** Map scroll：horizontal auto、contain overscroll、thin scrollbar、`12px` radius、`1px --line`、background `#f6f6f1`。
- **[FROZEN STYLE]** 默认 map canvas min-width `700px`；overview/daily 强制 min-width `0`；`≥1000px` 主地图 min-width `0`。
- **[FROZEN STYLE]** Map utility flex space-between/center、margin `5px 0 12px`、muted `12px`；button transparent、padding `8px`、`12px`。
- **[FROZEN STYLE]** Daily map overflow hidden；移动 place dot hit target `14×14px`、visible point `8×8px`；desktop/default为 `24×24px` 与 `11×11px`。
- **[FROZEN STYLE]** Transport pin default `28×28px`、radius `8px`、white、route-color border/text；移动 `24×24px`、radius `7px`。
- 地图路线、地名、地图字体与 fixture 坐标不在本轮冻结范围。

## 5. Daily Itinerary

### 5.1 Timeline、Day Card 与 Accordion

- **[FROZEN STYLE]** Timeline relative；主线 absolute `left:18px; top:22px; bottom:26px; width:1px; background:--line`。
- **[FROZEN STYLE]** Day card relative、padding-left `48px`；相邻日 margin-top `8px`。
- **[FROZEN STYLE]** Day dot `13×13px`、left `12px`、top `25px`、`3px --paper` border、灰色填充/outline；Today 使用 terracotta 和 `0 0 0 3px rgba(182,92,58,.18)`。
- **[FROZEN STYLE]** Day toggle width 100%、min-height `78px`、padding `15px 4px`、bottom border、transparent、two-column grid、gap `12px`。
- **[FROZEN STYLE]** Meta mono lake `11px/750/1.3/.05em`；title margin top `5px`、`17px/740/1.35`；locations margin top `5px`、muted `12px/1.45`。
- **[FROZEN STYLE]** Chevron `36×36px`、circle、line border、lake；`.2s ease`，expanded rotate `45deg`。
- **[FROZEN STYLE]** Detail padding `18px 0 26px`；hidden 时 `display:none`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844`：Itinerary `x0 y1341.891 w390 h1496.625`；首 day card `x18 y1454.891 w354 h78`；toggle `x66 w306 h78`。
- **[GOLDEN FIXTURE MEASUREMENT]** `430×932`、Golden Day 3 expanded：Itinerary `y1352.695`；day card `x18 y1637.695 w394 h760.008`；toggle `x66 y1637.695 w346 h109.891`；detail `x66 y1747.586 w346 h650.117`。
- **[GOLDEN FIXTURE MEASUREMENT]** `1440×900`：Itinerary `x360 y1941.195 w720 h1293.836`；首 toggle `x408 y2054.195 w672 h78`。

### 5.2 Schedule Item、Time、Title、Description、Tag、Maps Button

- **[FROZEN STYLE]** Schedule list无 margin/padding/list style。
- **[FROZEN STYLE]** Item relative、padding `0 0 21px 82px`、min-height `50px`。
- **[FROZEN STYLE]** Item line：left `70px`、top `6px`、bottom `0`、width `1px`、`#dce4e2`；最后一项隐藏。
- **[FROZEN STYLE]** Point：left `66px`、top `5px`、`9×9px`、`2px --lake`、paper fill。
- **[FROZEN STYLE]** Time absolute left 0/top 0、width `62px`、muted mono `11px/700/1.45`。
- **[FROZEN STYLE]** Schedule text（同时承载 title/description 的现有文本结构）：`13px/1.65`。
- **[FROZEN STYLE]** Map links row margin top `7px`、flex wrap、gap `6px`。
- **[FROZEN STYLE]** Google Maps button/link：min-height `32px`、padding `6px 9px`、pill、border `#c8dadc`、color `#205e6b`、background `#edf6f5`、`11px/700`。
- **[FROZEN STYLE]** Note：margin top `8px`、padding `12px 14px`、left border `2px terracotta`、淡 terracotta background、`12px/1.6`。
- **[FROZEN STYLE]** Cost/tag row margin top `10px`、gap `6px`；tag `7px 9px`、radius `8px`、background `#e8eeeb`、`11px`。
- **[GOLDEN FIXTURE MEASUREMENT]** `430×932` expanded state：首 schedule item `w346 h102.891`；text `x148 w264`、computed `13px/21.45px`；map button `x148 w122.406 h32`。

### 5.3 Ticket

- **[FROZEN STYLE]** 当前 timeline 内 compact ticket 的最终规则优先于旧 details 规则：min-height `58px`、padding `9px 10px`、flex start、gap `9px`、border `1px #e8c8b8`、radius `12px`、background `#fff2ed`、overflow hidden。
- **[FROZEN STYLE]** Check `21×21px`、margin top `1px`、`1.5px #ba765d`、radius `7px`。
- **[FROZEN STYLE]** Content 为两列 grid、gap `2px 7px`；status `9px/780 #995137`；title `11px` ellipsis；detail `9px/1.45 #795c50`。
- **[FROZEN STYLE]** Purchased：border `#cbdcca`、background `#eaf3e9`、forest check/status、title muted + line-through、detail隐藏。
- **[FROZEN STYLE]** Day ticket summary 为 min-height `24px` pill、`4px 8px`、`10px/760`；pending 与 complete 色值保持现状。
- **[FROZEN STYLE]** 独立 ticket-card/filter 样式虽当前 HTML 无固定 tickets section，仍是 Golden CSS 中已有视觉资产：card `17px` padding、`16px` radius；filter min-height `38px`；empty `28px 0`。未来删除或启用前必须先确认其 DOM 使用状态。
- **[GOLDEN FIXTURE MEASUREMENT]** `430×932` expanded schedule ticket `x148 w264 h58`、radius `12px`。

## 6. Rental

- **[FROZEN STYLE]** Rental panel overflow hidden、radius `24px`、ink background、white text、主 shadow。
- **[FROZEN STYLE]** Return deadline padding `22px`、background `#fff0e5`、color `#713d27`、bottom border `3px #bd6941`；urgent 切换为 `#ffe1da/#8c291f/#b84635`。
- **[FROZEN STYLE]** Deadline label `12px/800`；主日期 `clamp(23px,7vw,34px)/1.3`，margin `12px 0 6px`；timer padding `12px 0`、block borders、`16px/750`、tabular numerals。
- **[FROZEN STYLE]** Countdown padding `24px`、lake background；label `11px/700/.08em`、light lake；value mono `clamp(28px,9vw,44px)/760/1.05/-.05em`。
- **[FROZEN STYLE]** Details padding `22px`；car `19px/750`；sub `12px #abc0c4`；stops margin top `24px`、gap `16px`，每项 columns `58px 1fr`、gap `12px`；`≥700px` stops 为两列。
- **[FROZEN STYLE]** Price top border `rgba(255,255,255,.14)`、margin/padding top `20/18px`、`12px`；金额 white mono `15px/720/1`。
- **[FROZEN STYLE]** Drive tabs 三等列、bottom border；button min-height `48px`、`12px 4px`、`12px/650`，active `780` + bottom `2px lake`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844`：Rental section `x0 y2838.516 w390 h1344`；panel `x18 y2951.516 w354 h759.023`；deadline约 `277.172px`、countdown约 `137.852px`、details约 `344px`；drive tabs `y3724.539 h49`。
- **[GOLDEN FIXTURE MEASUREMENT]** `430×932`：panel宽 `394px`、高约 `748.445px`。
- **[GOLDEN FIXTURE MEASUREMENT]** `1440×900`：panel `x360 y3348.031 w720 h660.578`。

## 7. Todo

- **[FROZEN STYLE]** Form two-column grid `1fr auto`、gap `8px`。
- **[FROZEN STYLE]** Input min-height `48px`、padding `0 14px`、`1px --line`、radius `13px`、background `rgba(255,255,255,.8)`、`13px`；focus lake border + `0 0 0 3px rgba(40,123,144,.1)`。
- **[FROZEN STYLE]** Add button min `64×48px`、border 0、radius `13px`、white on ink、`12px/750`。
- **[FROZEN STYLE]** List margin top `13px`；item min-height `54px`、bottom border、two-column grid、center、gap `8px`。
- **[FROZEN STYLE]** Item label min-height `54px`、flex、gap `10px`；check `22×22px`、`1.5px #93a5a2`、radius `7px`；text `13px`、anywhere wrap。
- **[FROZEN STYLE]** Complete：forest check，muted line-through text；delete min `44×44px`、`10px #9a7062`、transparent。
- **[FROZEN STYLE]** Empty state margin 0、padding `22px 0 8px`、muted centered `11px`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844`：Todo section `x0 y4182.523 w390 h263`；form `x18 y4295.523 w354 h48`，columns约 `282/64px`。
- **[GOLDEN FIXTURE MEASUREMENT]** `430×932`：form `w394px`，columns约 `322/64px`。
- **[GOLDEN FIXTURE MEASUREMENT]** `1440×900`：form `x360 y4512 w720 h48`。

## 8. Footer

- **[FROZEN STYLE]** 宽 `min(100%,720px)`、居中、padding `46px 20px calc(50px + safe-bottom)`、top border、flex space-between、muted `12px`。
- **[FROZEN STYLE]** mark weight `750`、letter `.08em`；back-to-top min-height `44px`、margin-top `-15px`、无 underline。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844`：Footer `x0 y4445.523 w390 h126`。
- **[GOLDEN FIXTURE MEASUREMENT]** `1440×900`：Footer `x360 y4662 w720 h126`。

## 9. Ledger Page

### 9.1 Page、Header 与 Tabs

- **[FROZEN STYLE]** Ledger view min-height `100dvh - 48px`、background `#fafbf9`；进入时 `.16s ease-out` opacity/translate 动画，reduced motion 下关闭。
- **[FROZEN STYLE]** App width `min(100%,720px)`、居中、mobile padding `30px 18px calc(58px + safe-bottom)`、desktop `38px 0 74px`。
- **[FROZEN STYLE]** Header flex space-between/center、gap `18px`；H1 `clamp(30px,9vw,42px)/820/1/-.055em`。
- **[FROZEN STYLE]** Header text/icon controls min-height `42px`；icon pill 白色 + `rgba(19,38,47,.14)` border。
- **[FROZEN STYLE]** Tabs margin top `26px`、gap `26px`、bottom border；tab min-height `50px`、`14px/740`；active ink + bottom `3px lake`。
- **[FROZEN STYLE]** `≤420px` header align-start，actions column-reverse，text button min-height `31px`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844` entry：Ledger app `x0 y48 w390`、padding left/right `18px`、顶部 `30px`；header `x18 y78 w354 h42`；H1 computed font-size `35.1px`；tabs `x18 y146 w354 h51`。

### 9.2 Ledger Summary 与 Members Strip

- **[FROZEN STYLE]** Members strip margin top `27px`；heading flex；标题 `19px/790`、count `11px #8a9798`。
- **[FROZEN STYLE]** Inline members flex wrap，最终 gap `16px 14px`，margin top `17px`；person/add slot width `50px`、gap `6px`、`10px`。
- **[FROZEN STYLE]** Avatar `42×42px`、circle、white、dynamic existing palette background、`17px/790/1`；small `28×28/11px`，tiny `24×24/10px`。
- **[FROZEN STYLE]** Add avatar `42×42px`、dashed `#a7c4c8`、`23px` plus。
- **[FROZEN STYLE]** Stats overview margin top `28px`、padding `18px 20px`、Ledger base surface；total `clamp(26px,8vw,32px)/1/-.045em`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844`：members strip `x18 y224 w354 h126`，inline row `y283 h67`；stats overview `x18 y225 w354 h112.5`，total computed `31.2px`。

### 9.3 Bill Form、Amount、Currency、Participants

- **[FROZEN STYLE]** Entry card margin top `27px`、padding `20px`（desktop `22px`；`≤420px` 为 `17px 15px`）、base Ledger surface。
- **[FROZEN STYLE]** Form margin top `19px`；amount block max width `310px`、columns `minmax(108,124px) minmax(0,176px)`、gap `10px`。
- **[FROZEN STYLE]** Field label `11px/720/1.3 #788688`、margin bottom `7px`；help `10px #a0acad`。
- **[FROZEN STYLE]** Currency dropdown summary最终 min-height `44px`、padding `0 11px`、`1px rgba(19,38,47,.16)`、radius `11px`、background `#fbfcfb`、`13px/720`；open focus ring `0 0 0 3px rgba(40,123,144,.1)`。
- **[FROZEN STYLE]** Currency menu absolute、top `100% + 6px`、width `min(180px,100vw - 66px)`、max-height `220px`、padding `6px`、gap `3px`、radius `12px`、shadow `0 14px 32px rgba(19,38,47,.14)`。
- **[FROZEN STYLE]** Amount input最终 min-height `44px`、padding `0 12px`、同 dropdown border/radius/background、right aligned、`13px/720`、letter spacing `0`。较早的大号无边框声明被 final refinement 覆盖，不作为最终验收值。
- **[FROZEN STYLE]** Category grid六列、gap `5px`；choice min-height `43px`、radius `9px`、`10px/680`；selected lake + `#e7f2f3`。
- **[FROZEN STYLE]** Note/date columns `88px 1fr`，`≤420px` 为 `76px 1fr`；control min-height `40px`、radius `10px`、`13px`。
- **[FROZEN STYLE]** Participant grid最终六列、gap `15px 4px`、margin top `10px`；choice width `48px`，`≤420px` width `46px`、inline gap `1px`。
- **[FROZEN STYLE]** Participant avatar `44×44px`；unchecked opacity `.48` + saturate `.48`；checked双环并显示 `18×18px` check。
- **[FROZEN STYLE]** Primary/secondary button min-height `48px`、radius `12px`、`13px/760`；primary width 100%、white on `#132d37`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844`：Entry card `x18 y377 w354 h704.984`、padding `17px 15px`；amount block `x34 y455.094 w310 h65.297`，columns `124/176px`；controls `y476.391 h44`；category grid `x34 y559.688 w322 h43`；participant grid `x34 y759.984 w322 h65`；primary button `x34 y1015.984 w322 h48`。

### 9.4 Bill List 与 Bill Item

- **[FROZEN STYLE]** List section margin top `28px`、base Ledger surface、overflow hidden；header padding `19px 16px 15px`。
- **[FROZEN STYLE]** Total label `10px`；amount `21px/1/-.035em`。
- **[FROZEN STYLE]** Bill row padding `15px 16px 12px`、top border；main最终为 grid `1fr auto`、align start。
- **[FROZEN STYLE]** Category mark `7×7px`，各分类固定色；title `14px/760`；amount `16px/760`；base converted `10px lake`。
- **[FROZEN STYLE]** People row flex wrap space-between、gap `8px 14px`、margin top `11px`、`10px`。
- **[FROZEN STYLE]** Inline note trigger min-height `34px`、padding `3px 0`、radius `6px`、`10px/1.4`，ellipsis；focus为 `2px #9fc4c9`。
- **[FROZEN STYLE]** Row actions margin top `3px`、gap `4px`；button min-height `28px`、`10px`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844` Golden data：list `x18 y1109.984 w354 h860.094`；首 bill row `x19 y1186.078 w352 h153`。其高度是当前内容 fixture，不是通用固定高度。

### 9.5 Member Statistics 与 Settlement

- **[FROZEN STYLE]** Settlement/member section margin top `30px`；列表 margin top `14px`、display grid、gap `10px`、无外框/背景。
- **[FROZEN STYLE]** Transfer row最终 min-height `84px`、columns `42px 1fr auto`、gap `11px`、padding `12px 16px`、17px card surface；amount `19px/780 #b04439`。
- **[FROZEN STYLE]** Member stat为17px card surface、overflow hidden；summary最终 min-height `78px`、padding `14px 17px`。
- **[FROZEN STYLE]** Chevron `27px/300/1`，open rotate `90deg`；body padding `0 17px 17px`。
- **[FROZEN STYLE]** Metrics三列、gap `8px`（≤360 为5）、top padding `14px`、top border；dt `9px`（≤360 为8），dd `14px/730`（≤360 为13）。
- **[FROZEN STYLE]** Positive lake、negative `#c66b46`、neutral `#869394`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844` Stats fixture：document height约 `2198px`；settlement `x18 y367.5 w354 h327.094`；transfer list `x18 y422.594 w354 h272`，当前 3 rows；member section `y724.594`、list `y779.688 w354 h1361`，当前 4 个展开卡片。数量和总高度只属于当前数据 fixture。

### 9.6 Dialog、Currency Selector、Buttons、Inputs、Empty State

- **[FROZEN STYLE]** Dialog width `min(100% - 28px,560px)`、max-height `min(86dvh,760px)`、margin auto、overflow hidden、`1px rgba(19,38,47,.1)`、radius `20px`、white、shadow `0 22px 70px rgba(19,38,47,.2)`。
- **[FROZEN STYLE]** Backdrop `rgba(19,38,47,.28)` + blur `3px`。
- **[FROZEN STYLE]** Header padding `22px 20px 15px`、bottom border；title margin top `5px`、`21px/-.035em`；close `38×38px`、circle、`23px`。
- **[FROZEN STYLE]** Body padding `16px 20px 21px`、overflow auto。
- **[FROZEN STYLE]** Currency search min-height `48px`、columns `23px 1fr`、gap `8px`、padding `0 13px`、border `#b9d0d4`、radius `13px`、background `#f7fbfa`。
- **[FROZEN STYLE]** Currency result min-height `68px`、columns `50px 1fr auto`、gap `8px`、padding `0 10px`、radius `12px`；results gap `7px`、margin top `14px`、max-height `49dvh`。
- **[FROZEN STYLE]** Common currency chip min-height `31px`、pill、gap `6px`、padding `0 7px 0 10px`。
- **[FROZEN STYLE]** Ledger empty state `23px 16px`、center、`12px/1.5 #8b9899`；dialog empty `13px 0`；currency empty `27px 10px`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844` Settings dialog：`x19 y210.352 w352 h423.297`；header `x20 y211.352 w350 h86.797`；body `x20 y298.148 w350 h334.5`；base currency button `x40 y365.148 w310 h64`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844` Currency search/result：dialog in result state约 `x19 w352`；search rendered `h44 w251` inside 48px search wrapper；single result `w310 h68`；无结果 message `x40 y455.148 w310 h91.5`。
- **[GOLDEN FIXTURE MEASUREMENT]** `390×844` Member dialog：`x19 y188.953 w352 h466.094`；body `x20 y276.75 w350 h377.297`；add-member form `x40 y481.75 w310 h136.297`。

## 10. Loading、Empty 与 Overlay Surfaces

- **[FROZEN STYLE]** Loading error fixed left/right/bottom `16px + safe-bottom`、z-index `30`、padding `16px`、radius `14px`、white on warning、主 shadow；detail margin top `5px`、`12px/1.5`。
- **[FROZEN STYLE]** Place map overlay fixed inset 0、z-index `60`、`rgba(7,18,22,.6)`、bottom aligned；sheet宽 `min(100%,720px)`、高 `85dvh`、paper、top radius `20px`、column flex、overflow hidden。
- **[FROZEN STYLE]** Fullscreen map dialog保持现有 overlay/control shell；地图内部视觉以 `golden-map-spec.md` 为准。
- **[FROZEN STYLE]** 各 empty state 的留白、字体和颜色不可在架构重构中统一成新的 generic empty-state 组件，除非最终 computed style 与当前各模块分别相同。

## 11. Browser Measurement Interpretation

当前代码值与此前浏览器渲染值没有发现实质视觉冲突。已观察到的差异均属于以下正常类别：

1. **CSS 计算值**：例如 Hero `12vw` 在 390/430 viewport 分别渲染为 `46.8/51.6px`，桌面被 `64px` cap；不是规则不一致。
2. **内容与可用宽度计算**：例如移动 flight card 是 carousel content width 减 `20px`；桌面为 `86%`，产生 `619.195px` 的小数宽度。
3. **级联覆盖**：Ledger amount input、participant grid、transfer/member card 以文件末尾 final refinements 为最终视觉，早期声明不是最终结果。
4. **内容 fixture 高度**：day toggle、bill row、rental panel、整个 document 的高度随 Golden 内容而变化，只能作为 fixture measurement。

## 12. 尚未确认的 UI 参数

以下不阻塞 Round 1，但必须在后续截图/DOM contract 执行时明确处理：

- 尚未对每个组件在三个 viewport 的所有状态逐一保存截图；本轮只定义 manifest。
- 独立 `tickets-section/ticket-card` 当前没有在固定 HTML 中出现；CSS 值已记录，但其线上 rendered bounds 尚未确认。
- Ledger empty state、loading error、bill inline-note editing、base-currency locked、所有 currency result 数量状态没有在三个 viewport 全量测量。
- Map 内部 route/place/label/legend 的视觉数值由 `golden-map-spec.md` 冻结。
- 系统字体在非 macOS/非当前浏览器的字形 metrics 与抗锯齿容差尚未设定；未来像素回归必须允许字体渲染容差，同时严格校验 computed font properties 和 bounds。

这些项目应标为“待补 fixture”，不能被解释为允许重新设计。
