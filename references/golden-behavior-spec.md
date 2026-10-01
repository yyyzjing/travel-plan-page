# Golden Behavior Specification

基线日期：2026-09-10  
事实来源：Golden Version 的 `app.js`、`site-navigation.js`，以及此前已完成的 Map shell 浏览器/代码审计。Ledger 细节见 `golden-ledger-spec.md`。

## 0. 分类

- **[FROZEN BEHAVIOR]**：成熟产品交互。架构重构必须保持用户可观察结果。
- **[CURRENT IMPLEMENTATION]**：当前代码路径，可能在后续架构中被配置化或替换；不自动成为产品规则。
- **[POTENTIAL BUG]**：代码已显示风险或不一致，但影响尚未完成真实边界验证。
- **[UNVERIFIED]**：缺少足够的真实浏览器、失败注入或多设备验证；不得猜测。

“冻结”指相同有效输入与状态下的行为结果一致，不要求函数名、文件位置或内部模块边界不变。

## A. Travel Navigation

### A00 Config-driven modules

**[FROZEN BEHAVIOR]**

- Given `trip-data.json > config.modules`中某模块为`false`  
  Then该section、导航入口与相关初始化均不出现，不留下空白，也不发起该模块的runtime/API请求。
- Given前置模块关闭  
  Then页面与导航从第一个启用模块开始；不得依赖手工删除HTML或JavaScript。
- Given Config缺失或非法  
  Then显示明确配置错误；不得自行猜测用户模块选择。

### A01 Travel / Ledger 页面切换

**[FROZEN BEHAVIOR]**

- Given 当前位于 Travel view  
  When 点击顶部“记账”  
  Then 阻止默认锚点跳转，关闭 Travel 下拉菜单，地址变为 `#ledger`，Travel `hidden + inert`，Ledger 取消 `hidden/inert`，body 标记 active view，Ledger Entry tab 激活。

- Given 当前位于 Ledger view  
  When 点击 Travel 菜单中的 section link 或 wordmark  
  Then 关闭菜单、显示 Travel、隐藏并 inert Ledger；section link滚动到目标 section，wordmark滚动到 `#top`。

- Given 页面由 `#ledger-stats` 打开  
  When 初始 route 执行  
  Then Ledger view显示且 Stats tab激活；`#ledger` 激活 Entry tab。

### A02 顶部导航和当前状态

**[FROZEN BEHAVIOR]**

- Given Travel view active  
  When 导航状态同步  
  Then Travel summary具有 `aria-current="page"`，Ledger link移除该属性，skip link指向 `#main`。

- Given Ledger view active  
  When 导航状态同步  
  Then Ledger link具有 `aria-current="page"`，Travel summary移除该属性，skip link指向 `#ledger-root`。

### A03 Travel 下拉菜单

**[FROZEN BEHAVIOR]**

- Given Travel details menu打开  
  When 点击菜单外部  
  Then 移除 `open`。

- Given Travel details menu打开  
  When 点击任一 Travel link或 Ledger link  
  Then 菜单先关闭，再执行导航。

- **[CURRENT IMPLEMENTATION]** 菜单为原生 `<details>/<summary>`；除浏览器原生行为外，没有单独实现 Escape、方向键或 menu roving focus。
- **[UNVERIFIED]** 不同浏览器对原生 details 的 Escape 行为和 `role=menu/menuitem` 键盘体验尚未逐项验证。

### A04 Scroll、历史和返回

**[FROZEN BEHAVIOR]**

- Given Travel 与 Ledger 已分别滚动  
  When 在两个 view 之间切换  
  Then 离开 view 时把 `window.scrollY` 保存到内存中的对应 slot。

- Given 点击 Travel section link  
  When Travel view显示  
  Then 使用目标元素 `scrollIntoView({block:"start"})`；CSS smooth scroll/reduced-motion结果由 Frozen UI 控制。

- Given 切换到一个没有 section target 的新 view  
  When 不是 browser restore  
  Then 滚动到 top `0`。

- Given 浏览器 Back/Forward 造成 view改变  
  When `popstate` 在 animation frame 中处理  
  Then 尝试恢复该 view 的内存 scroll position；`history.scrollRestoration` 为 `manual`。

- **[CURRENT IMPLEMENTATION]** Scroll positions只存于当前页面内存，不跨 reload/tab持久。
- **[UNVERIFIED]** 同一 view 内 `#ledger ↔ #ledger-stats` 的 Back/Forward 与连续 `popstate/hashchange` 组合下，scroll精确恢复结果尚未做浏览器矩阵验证。

### A05 外部链接

**[FROZEN BEHAVIOR]**

- Given 用户点击 Place overlay footer 的 Google Maps link或 driving reference link  
  When 浏览器允许打开外部页面  
  Then 以新 browsing context 打开，使用 `target="_blank"` 和 `rel="noopener noreferrer"`。

- Given 用户点击 timeline 的地点地图按钮  
  When overlay打开  
  Then 先在站内 iframe展示 Google Maps，并提供外部打开入口；不会直接离开当前行程页。

- **[UNVERIFIED]** 各浏览器 popup policy、Google 网络不可达与 iframe CSP/地区限制下的最终外部打开结果。

## B. Flight

### B01 Carousel、snap、centered card 和 active dot

**[FROZEN BEHAVIOR]**

- Given 多个 journey card已渲染  
  When 用户水平滚动 carousel  
  Then CSS执行 mandatory x snap；scroll handler在下一 animation frame计算 viewport center与每张 card center的绝对距离，距离最小的 card成为 active。

- Given active card改变  
  When center计算完成  
  Then 只有对应 dot获得 `is-active`，section index显示一基序号 `activeIndex + 1 / journeyCount`。

- Given 初次渲染  
  When 尚未滚动  
  Then 第一颗 dot active，index为 `1 / count`。

- **[CURRENT IMPLEMENTATION]** 两张 card center等距时，因只接受严格更小距离，数组中较早的 card胜出。

### B02 Journey status

**[FROZEN BEHAVIOR]**（状态阶段），**[CURRENT IMPLEMENTATION]**（时间解析来源）

- Given 当前时间早于某段 departure  
  When 按航段顺序扫描  
  Then 第一段显示“距离起飞还剩”，后续段显示“距离下一程起飞还剩”，target为该 departure。

- Given departure已过且 arrival未到  
  When 状态计算  
  Then 显示“飞行中 · 距抵达”，target为 arrival。

- Given 所有 arrival均已过  
  When 状态计算  
  Then label为“已抵达”，card value为“已完成”。

- **[CURRENT IMPLEMENTATION]** departure/arrival分别由该端点的本地日期、时间和 `utcOffset` 解析；不再使用机场代码或固定 offset 表。非 placeholder 航段的 offset 由轻量 validator 按 `±HH:MM` 检查。

### B03 Countdown 与每秒刷新

**[FROZEN BEHAVIOR]**

- Given target在未来  
  When precise countdown渲染  
  Then 使用 floor后的总秒数；有天数显示 `N天 HH:MM:SS`，不足一天显示 `HH:MM:SS`，时分秒补零。

- Given target已到或已过  
  When countdown渲染  
  Then 使用调用方 completion text；flight card最终显示“已完成”或过渡调用中的“即将出发”。

- Given Travel初始化完成  
  When countdown timer启动  
  Then 立即更新一次 flight/rental，再以 `1000ms` interval更新。

### B04 跨日期

**[FROZEN BEHAVIOR]**

- Given stop日期与 journey起始日期相同  
  When 日期标签渲染  
  Then 显示紧凑月日。

- Given stop日期比 journey起始日期晚一天  
  When 日期标签渲染  
  Then 显示“次日”。

- Given日期差不是0或1  
  Then 显示该日期的紧凑月日。

### B05 Today / future / past

- **[FROZEN BEHAVIOR]** Flight的 future/in-flight/past阶段切换及文本语义冻结。
- **[CURRENT IMPLEMENTATION]** Flight本身不使用 Today label；Daily Today优先使用可选的 `metadata.timeZone` IANA 时区覆盖值，缺失或无效时回退当前浏览器时区。
- **[UNVERIFIED]** target精确等于当前毫秒、浏览器休眠唤醒、后台tab interval节流后的边界显示。

### B06 缺失航班材料时继续预览

**[FROZEN BEHAVIOR]**

- Given 用户在 Round 1 保留航班模块，但已确认材料缺失，并在 Round 2 选择继续预览  
  Then 渲染标准的“资料待补充”航班卡，明确列出缺失类别。
- Placeholder 不包含猜测的航空公司、航班号、机场、起降时间或时区，也不运行倒计时。
- Given 用户在 Round 1 关闭航班模块  
  Then 整个航班 section、导航和倒计时初始化均不出现，不生成 placeholder。

## C. Daily Itinerary

### C01 初始展开逻辑和 Today

**[FROZEN BEHAVIOR]**

- Given trip days中存在日期等于“当前旅行日”的 day  
  When timeline首次渲染  
  Then 该 day为唯一展开项，card有 Today状态及“今天”文字。

- Given不存在匹配 day  
  When timeline首次渲染  
  Then `expandedDay=null`，所有 day detail关闭。

- **[CURRENT IMPLEMENTATION]** “当前旅行日”优先由可选的 `metadata.timeZone` IANA 时区覆盖值决定；缺失或无效时使用当前浏览器时区。

### C02 Accordion 单开、展开和收起

**[FROZEN BEHAVIOR]**

- Given任意 day toggle被点击  
  When该 day原本关闭  
  Then 先把所有 toggles设为 collapsed、隐藏所有 details，再仅展开所点 day并更新 `expandedDay`。

- Given所点 day原本展开  
  When再次点击  
  Then 所有 days关闭，`expandedDay=null`。

- Given展开或收起  
  Then 不自动把 day滚动到视口，也不重建 timeline DOM。

### C03 Schedule content、地图按钮、note/cost/tag

**[FROZEN BEHAVIOR]**

- Given day包含 schedule items  
  When渲染  
  Then 保持数据顺序，并显示 time、escaped text、关联 ticket、地点按钮。

- Given day包含 notes或 source date conflict  
  When渲染  
  Then 普通 notes在前，source conflict附加在后，逐条显示。

- Given day包含 cost references  
  When渲染  
  Then 按 amount、standard、discounted、amountOptions的现有优先级生成 tag文字。

- Given schedule item按 navigation policy被认定无需导航  
  Then 不显示地点按钮。

- **[LEGACY COMPATIBILITY]** 旧Demo可能仍由schedule文本、match terms、名称、priority与字符串最后出现位置推断地点；新canonical Trip必须使用typed Place references，validator不得允许显示文案控制新数据关联。

## D. Ticket

### D01 Ticket 与 schedule 的当前关联

**[CURRENT IMPLEMENTATION]**

- Given ticket的 `day` 等于当前 day  
  And schedule item text转为 locale lowercase  
  When 任一 `scheduleMatchTerms` 小写后是该文本的 substring  
  Then ticket渲染到该 schedule item。

- Given同一 ticket命中同一天多个 item  
  Then 当前实现可能在多个位置渲染同一 ticket；所有实例通过 ticket ID同步视觉状态。

- 该字符串关联不是 **[FROZEN BEHAVIOR]**，只允许作为旧fixture兼容。新canonical Trip必须由Day Item `ticketIds[]`关联；同一Golden fixture的可见结果仍须保持。

### D02 Pending / Purchased

**[FROZEN BEHAVIOR]**

- Given ticket data `purchaseStatus="purchased"` 或 runtime completion set包含 ticket ID  
  Then ticket为 purchased。

- Given ticket未 purchased  
  Then 根据 requirement显示“需提前购票 / 建议预约 / 购票方式待确认 / 门票信息”。

- Given day有 tickets  
  Then day summary显示 pending数量；全部 purchased时显示“门票已准备”。

### D03 完成、取消和 Runtime sync

**[FROZEN BEHAVIOR]**（用户意图），**[CURRENT IMPLEMENTATION]**（保存时序）

- Given用户勾选 ticket  
  When change触发  
  Then立即把ID加入runtime Set、更新所有相同ticket实例及day summary，并交给当前persistence adapter保存。

- Given用户取消勾选  
  Then立即移除ID并更新UI，并交给当前persistence adapter删除。

- Given默认local mode  
  Then从当前浏览器按Trip ID读取/保存Ticket状态，不访问`/api/trip`。

- Given用户明确启用D1且`tickets`在`sharedCollections`  
  Then从共享快照读取truthy completion，并通过同源API同步变更。

- **[CONFIRMED ISSUE]** 可选D1模式下POST失败仍可能只`console.error`，不回滚Set/UI、不显示用户错误；刷新后的结果可能与刚才UI不同。此失败行为不冻结为正确产品行为。

### D04 Ticket document and purchase link

**[FROZEN BEHAVIOR]**

- Given Ticket有获准进入Trip assets的PDF或图片  
  When用户点击票据入口  
  Then先在站内dialog/overlay预览，不直接离开旅行页；close、backdrop、Escape和focus return遵守现有overlay规则。
- Given Ticket只有官方购买URL  
  Then入口明确标识为外部购买页，并使用`target="_blank"`与`rel="noopener noreferrer"`。
- Given票据材料缺失且用户选择继续预览  
  Then显示“待补充”，不生成无效或猜测URL。

## E. Todo

### E01 新增和空输入

**[FROZEN BEHAVIOR]**

- Given输入 trim后为空  
  When提交  
  Then 不新增、不保存，保留页面状态。

- Given输入非空  
  When提交  
  Then生成稳定唯一runtime ID，追加`{text,completed:false}`，清空input，交给当前persistence adapter保存并立即重绘。

- ID生成格式属于 **[CURRENT IMPLEMENTATION]**；唯一、稳定的 runtime ID语义属于 Frozen behavior。

### E02 完成、取消和删除

**[FROZEN BEHAVIOR]**

- Given用户切换checkbox  
  When change触发  
  Then立即更新对应todo.completed、交给当前persistence adapter保存、重绘progress/list。

- Given用户点击删除  
  Then立即从数组移除、交给当前persistence adapter删除、重绘；当前没有confirm dialog。

- Given list为空  
  Then 显示“还没有准备事项，添加第一项吧。”，progress为 `0 / 0`。

- Given默认local mode  
  Then从当前浏览器按Trip ID读取/保存Todos，不访问`/api/trip`。

- Given用户明确启用D1且`todos`在`sharedCollections`  
  Then使用共享snapshot `todos`；非数组退回空数组。

- **[CONFIRMED ISSUE]** 可选D1模式的upsert/delete失败仍可能只写console；没有rollback、retry UI或用户可见notice，不冻结为正确行为。

### E03 Optional shared load failure

- **[CURRENT IMPLEMENTATION]** 仅D1 shared mode会访问Shared API；load失败时仍继续渲染Travel并保留可操作状态。
- **[POTENTIAL BUG]** D1错误提示/重试与本地已存在状态的合并仍需失败注入验证；不得把读取失败静默解释为远端真实空状态。

## F. Rental

### F01 Pickup / Return status

**[FROZEN BEHAVIOR]**（阶段语义）

- Given now早于 pickup  
  Then label为“距取车”，target为 pickup。

- Given now介于 pickup和dropoff  
  Then label为“距还车”，target为 dropoff。

- Given now达到或超过dropoff  
  Then label为“已超过预约还车时间”，主文案提示立即联系 rental company。

- **[CURRENT IMPLEMENTATION]** `rentalStatus()` 分别使用 pickup/dropoff 自己的 `utcOffset`，deadline timer 使用同一个 dropoff offset。已开启租车模块时，两个 offset 均由轻量 validator 按 `±HH:MM` 检查。

### F02 Countdown、deadline 和 urgent

**[FROZEN BEHAVIOR]**

- Given deadline未来  
  Then deadline显示“距还车截止 {precise countdown}”。

- Given deadline已过  
  Then显示预约时间已过的联系提示。

- Given remaining `<= 86,400,000ms`，包括已过期  
  Then deadline增加 urgent视觉状态。

- Given rental阶段未完成  
  Then status区使用较粗粒度 countdown：有天显示天/小时，有小时显示小时/分钟，不足一小时至少显示1分钟。

### F03 Drive tabs

**[FROZEN BEHAVIOR]**

- Given首次渲染  
  Then “取还车检查” active并显示对应列表。

- Given点击非active tab  
  Then 关闭其他 tabs，仅所点 tab `aria-expanded=true`，panel替换为对应内容。

- Given点击当前 active tab  
  Then 当前 tab collapse，panel hidden；允许没有任何 active内容。

- Driving reference links按外部链接规则打开。

## G. Map Shell Interaction

本节只冻结 shell行为，不重复地图视觉与数据审计。

### G00 Country switch

**[FROZEN BEHAVIOR]**

- Given Trip Data包含多个`routeMap.regions[]` Map Packages  
  When Route Explorer加载  
  Then按数据顺序显示相同数量的国家标签，默认选择`defaultRegionId`或第一个Package。

- Given用户选择另一个国家  
  When国家标签切换  
  Then切换到该国自己的base artwork、总览routes、places、annotations、legend和日期标签，并回到该国总览状态；不得保留上一国家的Day选择或地图数据。

### G01 Overview / Day switch

**[FROZEN BEHAVIOR]**

- Given某一国家的Route Explorer已加载  
  When用户选择 Overview  
  Then显示该国家的完整 artwork状态并同步 pressed tab。

- Given用户选择某个 Day  
  Then仅显示该 day的 daily map状态、地点/交通交互入口并同步 pressed tab。

- **[CURRENT IMPLEMENTATION]** Day与内部 route/layout的具体选择由当前 route module完成；目的地差异必须由 generated Map Package 表达，Core 不添加目的地特判。

### G02 Place popup 与 Google Maps

**[FROZEN BEHAVIOR]**

- Given用户点击地图 place dot  
  Then打开 place popover，显示地点标题、可用选项、嵌入地图和 Google Maps外链。

- Given同一地点存在多个 place options  
  When切换 option  
  Then pressed状态、iframe query和外链同步更新。

### G03 Transport popup

**[FROZEN BEHAVIOR]**

- Given用户点击 transport pin  
  Then打开固定定位 transport popover，展示关联交通 leg；同一时刻不保留冲突 popup。

- Given popup已开  
  When点击关闭、外部或另一入口  
  Then关闭/替换 popup，并同步 `aria-expanded`。

### G04 Fullscreen、Escape、outside、focus 与 scroll

- **[FROZEN BEHAVIOR]** Fullscreen入口打开 map dialog，关闭按钮/原生 dialog关闭路径应关闭；移动 overview map允许水平滚动，daily map shell不横向滚动。
- **[FROZEN BEHAVIOR]** Place overlay打开时锁定 body overflow，focus移动到 close；Escape、backdrop点击或 close关闭，清空 iframe、恢复原 body overflow并把focus还给 opener；Tab在 close和external link之间循环。
- **[CURRENT IMPLEMENTATION]** Route popover/transport popover具有Escape、outside click/focusin关闭和focus恢复逻辑（据此前审计）。
- **[UNVERIFIED]** Fullscreen map dialog在所有浏览器中的初始focus、完整focus trap、Escape后的focus return与fallback-open路径尚未逐项验证。

## H. Dialog / Overlay

### H01 Open / Close / Cancel / Backdrop

**[FROZEN BEHAVIOR]**

- Given一个 Ledger dialog打开  
  When请求打开另一个 Ledger dialog  
  Then先关闭当前 dialog，再打开目标 dialog；currency dialog可返回 settings。

- Given Ledger dialog open  
  When点击显式 close、原生 Escape/cancel或dialog backdrop本身  
  Then dialog关闭并清理对应 open state；members dialog同时清除 member edit state。

- Given浏览器无 `showModal()`  
  Then使用 `open` attribute fallback。

### H02 Focus

- **[FROZEN BEHAVIOR]** Ledger dialog打开后在下一 frame focus search input或第一个非color input/button；currency search选区位于当前query末尾。
- **[CURRENT IMPLEMENTATION]** Ledger dialog依赖原生 modal focus containment；没有自定义 Tab trap，也没有保存 opener引用。
- **[UNVERIFIED]** Ledger dialog关闭后的focus return目标、fallback-open的focus containment和不同浏览器 cancel事件次序。

### H03 Inline note editor

**[FROZEN BEHAVIOR]**

- Given点击账单备注  
  Then打开单行 editor、focus并select现有值。

- Given点击 editor外部或执行其他 Ledger action  
  Then先尝试保存；保存失败阻止后续 action。

- Given按 Escape或点击取消  
  Then放弃未保存内容并恢复只读 trigger。

- Given同一 bill正在完整编辑  
  When点击其 inline note  
  Then滚动/focus完整 bill form的 note字段，而非开启第二个 editor。

## I. Initialization、Error、Responsive 与 Reduced Motion

### I01 Travel load

- **[FROZEN BEHAVIOR]** Config与travel-data加载成功后，只初始化已启用模块；默认先读取local runtime state。只有显式D1 mode与allowlist才尝试shared state。
- **[FROZEN BEHAVIOR]** travel-data读取或主初始化失败时显示全局 loading error。
- **[CURRENT IMPLEMENTATION]** 可选 D1 shared state 读取失败不触发全局 loading error；Travel 端当前会把 Todo/Ticket 暂时呈现为空，且只写 console。这是 `known-issues.md#pb-04--d1-shared-state读取失败可能被呈现为空状态` 记录的可选 shared-mode 风险，不是应冻结的理想行为。

### I02 Ledger load/save

- **[FROZEN BEHAVIOR]** Ledger初始化时root标记`aria-busy=true`；当前adapter load完成后归一化并渲染，再移除busy。
- **[FROZEN BEHAVIOR]** 默认local mode无需D1；localStorage不可用时退回本标签页内存并保持可操作。
- **[FROZEN BEHAVIOR]** 显式D1 load/save失败显示live notice并保留安全的本地/上一次成功state，不把错误显示成“必须绑定作者数据库”。

### I03 Responsive / keyboard / reduced motion

- **[FROZEN BEHAVIOR]** 响应式改变布局而不删减功能；具体视觉见 Golden UI spec。
- **[FROZEN BEHAVIOR]** Ledger tabs支持 ArrowLeft/ArrowRight在两个 tab间切换并把focus移到新 tab。
- **[FROZEN BEHAVIOR]** Reduced motion时关闭 Ledger view animation并极小化CSS transition/animation duration。

## J. Ledger Product Interaction Summary

以下属于 **[FROZEN BEHAVIOR]**，精确数据与算法见 `golden-ledger-spec.md`：

- Traveler新增、编辑姓名/颜色、删除确认、重复姓名拦截、账单引用删除限制。
- Bill新增、编辑、删除确认、inline note编辑、payer单选、participants多选与全选/全不选切换。
- Base/foreign amount双字段，category/date/note，表单错误定位与live notice。
- Entry/Stats tab切换、hash同步、统计卡默认展开、空状态文案语义。
- 设置/成员/货币 dialogs与currency search。
- Ledger mutation在单浏览器内串行；成功后才替换 ledgerData并重绘，失败保持旧state。

以下不冻结为正确行为：settings persistence缺失、API无冲突控制、失败情况下的已知问题。

## K. Unverified Register

本轮仍为 **[UNVERIFIED]**：

1. Travel menu原生 details在各浏览器的Escape/键盘行为。
2. 同一 view内浏览器Back/Forward的精确scroll恢复。
3. countdown临界毫秒、后台tab节流和系统时间跳变。
4. Google iframe失败、popup policy与外部浏览器打开结果。
5. Fullscreen map dialog的完整focus return/trap/fallback路径。
6. Ledger native/fallback dialog关闭后的focus return与Tab containment。
7. Cloudflare/D1真实失败注入后的端到端notice、重试和最终一致性。
8. 两设备并发写入不同/相同记录的真实部署测试。
