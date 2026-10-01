# Golden Map Specification — Public Template Edition

状态：Standard Generator Map Guardrail  
范围：冻结地图视觉语言、Renderer层次和交互；不公开私人Golden目的地的路线、日期、坐标、query或assets。

## 1. Product Direction

地图采用 **deterministic two-mode generation**。Builder 自动选择 `country-golden` 或 `generic-diagram`，用户与 Agent 均不得手动设计第三种模式。国家模式从获授权的真实国家 Boundary 与地点坐标生成；通用模式复用唯一冻结示意底图并按确定性布局分散地点。两种模式均由同一 Renderer 以 Golden Map Style 呈现。

当前标准能力必须提供：

- GeoJSON country-boundary输入与source/license记录；
- lat/lng projection；
- 按canonical Place/Transport/Day引用生成route；
- 确定性的默认label layout；完整collision solver仍是独立框架增强；
- Overview 与 Daily 共用完整地图视口；
- 相同输入产生可复现Map Package。

单次Trip生成不得修改`overview-map.js`、`route-ui.js`、HTML或CSS，也不得手画国家轮廓、route path或pin坐标。Renderer/Core能力不足时应停止并报告为独立框架问题。

## 2. Layer Model

| Layer | Responsibility | Current public source |
|---|---|---|
| MAP SHELL | section、tabs、viewport、utility、fullscreen dialog | `index.html`, `styles.css` |
| MAP RENDERER | SVG layer composition、route、point、label、legend | `overview-map.js` |
| MAP STYLE | stroke、marker、type、surface、popover | JS SVG attributes + `styles.css` |
| MAP SOURCE DATA | country codes、canonical Places、Days、Transport order | private canonical input; compiled view in `travel-data.json` |
| MAP GENERATOR | auto mode、projection/schematic layout、base SVG、routes、labels、daily layouts | `scripts/build-map.mjs` |
| GENERATED MAP DATA | country packages、paths、projected places、daily layouts | generated region JSON + assets |
| MAP INTERACTION | Day切换、place/transport popup、Google Maps、fullscreen | `route-ui.js` |
| GENERATED TRIP ASSET | authorized region artwork与derived geometry | `assets/` + generated Map Data |

Source Data与Generated Trip Asset可以按旅行更换；Map Style、generator contract和可观察交互未经批准不得改变。

## 3. Canvas and Surface

### `[FROZEN MAP STYLE]`

- SVG：`display:block; width:100%; height:auto`，保持viewBox比例缩放。
- viewport：`border-radius:12px`、`1px solid var(--line)`、background `#f6f6f1`。
- Overview 与 Daily 保持完全相同的 canvas、viewBox、scale、extent 与 region 位置。
- map utility使用muted `12px`文字、两端对齐和无重装饰button。
- fullscreen沿用原dialog shell；Overview与Daily保持各自尺寸规则。

### `[GENERATOR CONTRACT]`

- 每个标准Map Package使用`1448×1086`、`4:3` canvas。
- projection、point、label、route 和 pin 使用同一 canvas 坐标系；Overview 与 Daily 固定共用该 canvas 的完整 bounds。

## 4. Region Artwork

### `[FROZEN MAP STYLE]`

- 浅奶油纸面；
- 低饱和灰绿region轮廓；
- 淡蓝水体与克制地理文字；
- 极淡等高线/地形线；
- 少量山脉、树木或目的地相关插画；
- 不让底图抢过route和label的信息层级。

### `[GENERATED TRIP ASSET]`

region shape、海岸线、湖泊和全部地理位置来自获授权的boundary/geodata，并由Core generator投影。山脉、树木、纹理等装饰层来自公共安全的Frozen style assets或确定性生成规则，不从私人地图复制。

公开Demo的`assets/maps/aster-isles-base.png`与`assets/maps/mist-coast-base.png`是原创生成的虚构国家底图。它们只作为fixture保留，不对应任何真实国家，也不能作为真实目的地的boundary来源。

## 5. Route

### `[FROZEN MAP STYLE]`

- SVG path `fill:none`。
- `stroke-linecap:round`、`stroke-linejoin:round`。
- 无arrow，无dash。
- 每条geometry绘制两层：主色`stroke-width:7`；上层白色`stroke-width:2`、`stroke-opacity:.22`。
- 默认六色palette：`#397dc1`、`#e77e22`、`#618344`、`#209aaa`、`#8865a5`、`#df6185`。
- Overview显示全部route；Daily只保留selected route，不使用inactive opacity。

### `[TRIP MAP DATA]`

- day与color assignment；
- 每日一条或多条SVG path；
- route是否往返、分支或中断；
- geometry与地点的地理关系。

Route path由generator根据有序的canonical Place/Transport引用生成。Agent不得直接编辑path，也不得通过截图估算或复制另一位用户的custom map。

## 6. Place Point

### `[FROZEN MAP STYLE]`

- Overview marker：`r=10.5`、per-place fill、`#fafaf4` stroke、`stroke-width=2.5`。
- Daily可交互点叠加透明hit target与route-color visual point。
- visible point有白边；hover/focus/expanded呈现同心ring反馈。
- hit target必须保持适合触控，不得缩小到可见圆点大小。

### `[TRIP MAP DATA]`

- place ID、geo和颜色语义；
- Day layout中显示哪些places；
- 起点、终点、途经点、换乘点等role；
- popup query和可选地点。

## 7. Labels and Heading

### `[FROZEN MAP STYLE]`

- family：`'Times New Roman', 'Kaiti SC', STKaiti, KaiTi, 'Songti SC', serif`。
- weight：`700`。
- fill/stroke：`#092653`。
- stroke width：`0.4`，paint order为stroke再fill。
- 多行label默认line rhythm：`31` canvas units。
- 支持per-label font size、x/y和`start | middle | end` anchor。
- Heading默认`40/700`，使用相同mixed serif/Kaiti语言。
- geographic annotation使用低饱和蓝色italic serif，可有多行。

### `[TRIP MAP DATA]`

地点文字、语言、字号例外、heading copy和annotation内容由该Trip提供；x/y、anchor与默认字号由projection/renderer的确定性默认布局派生。当前不承诺完整collision solver。必要的明确layout override仍属于Trip Data，但只能在独立地图精修任务中批准，不能在标准首版中临时手调。

## 8. Legend

### `[FROZEN MAP STYLE]`

- transparent，无独立卡片背景；
- serif `23/700`、深蓝文字；
- route-color round swatch，长度`28` canvas units、width`5`；
- default row step `43` canvas units；
- 日期由route对应Day读取，使用简洁month/day显示。

legend位置由generator按canvas与内容数量确定；明确override属于Generated Trip Layout。

## 9. Overview and Daily Composition

多国旅行首先显示由`routeMap.regions[]`生成的国家标签。切换国家必须同时切换base artwork、routes、places、annotations、legend和dailyLayouts；Core不得包含国家名称特判。

Overview layer order：

1. region artwork；
2. all route paths；
3. markers；
4. place labels；
5. geographic annotations；
6. heading；
7. date legend。

Daily composition：

1. 复用同一region artwork；
2. 只保留selected route；
3. 移除Overview markers、geographic annotations和legend；
4. 只保留dailyLayout指定labels并应用其x/y/anchor；
5. 在SVG上叠加HTML place buttons和transport pins。

Daily 不得按当天地点重新计算 bounds，不得 zoom-to-route、fitBounds、裁切或改变 transform；只切换当天路线、必要地点、交通 pins 与相关标签的可见性。

## 10. Transport Icon

### `[FROZEN MAP STYLE]`

- white/route-color rounded square；
- desktop约`28px`，窄屏约`24px`；
- subtle shadow、thin line icon；
- expanded：route-color background + white icon；
- 与route关联但不嵌入SVG path。

当前icon registry支持drive、train/rail、cable-car、hike/walk、boat/ferry、rental-car。未支持的真实交通类型使用已有安全fallback并记录框架缺口；增加Core图标必须作为独立框架维护任务并保持视觉语法。

Pin位置由generator根据route/nearby points派生；弹层内容通过Transport或Day Item stable IDs关联，不得使用schedule array index。插入/重排显示项目不能静默改变pin identity。

## 11. Place and Transport Popovers

### `[FROZEN MAP STYLE]`

- fixed positioning并限制在viewport边缘`8px`以内；
- white surface、现有border/radius/shadow；
- place popup包含role、title、optional choices、iframe、external link和network note；
- transport popup按配置顺序列出time/type/text；
- active pin使用expanded视觉。

### `[FROZEN BEHAVIOR]`

- 点击同一pin可关闭；
-点击其他pin替换当前popover；
- close、Escape、outside click/focus可以关闭；
- 需要时恢复opener focus；
- external link使用新窗口及`noopener noreferrer`；
- fullscreen克隆当前map visual state。

## 12. Responsive Rules

- route section在宽屏使用最多约`1100px`的视觉范围；
- 当前CSS `>=1000px`取消map canvas最小宽度；
- Overview 与 Daily 在 mobile 均保持同一整图范围，并避免页面整体横向溢出；
- popover每次打开、resize或scroll后重新定位；
- map dialog中canvas保持足够宽度查看细节。

任何selector重命名必须保持这些computed results，不得借机重做布局。

## 13. Standard Map Workflow

1. 从完整资料中确认`trip.primaryDestinationCountries`；出发地或纯转机国家默认排除。
2. 在canonical Place目录中保留每个已知地点的country code与经纬度；歧义地点进入第二轮确认，不降级成泛化城市点。
3. 为每个目的地国家取得可授权使用的准确GeoJSON boundary，并记录source/license；不要抓取或复制来源不明的地图。
4. 确保Day Item、Transport与Place使用stable IDs表达访问顺序与关系。
5. 运行：

   ```bash
   node scripts/generate-map-package.mjs \
     --boundary /absolute/path/to/authorized-country-boundary.geojson \
     --data /absolute/path/to/private/canonical-travel-data.json \
     --country <ISO2> \
     --out assets/maps/<country>-region.json \
     --source <BOUNDARY_SOURCE_OR_URL> \
     --license <BOUNDARY_LICENSE>
   ```

6. Generator输出固定`1448×1086`底图、投影地点、双stroke routes、labels、Overview与Daily layouts及pins；所有日期共用完整地图 bounds。
7. 用 `scripts/compile-travel-data.mjs` 合并 private canonical input、`trip-config.json` 和每个 generated region package，输出 Renderer 实际读取的 `travel-data.json`；不手工拼接字段。
8. 私人地址/query只进入该用户的Trip输出；公共cache只允许保存不含Trip地点与路线的country base。
9. 使用轻量 validator 检查 Boundary、place/day/reference 完整性与核心文件。
10. 检查国家标签数量、每个国家Overview、每个Day、popover、fullscreen和三个baseline viewports。

若标准生成器不能表达某个目的地，记录框架缺口并停止；不要在该用户的生成任务中局部改Renderer。

## 14. Privacy Contract

- 私人Golden目的地的实际route、dates、place list、coordinates、queries和assets不属于Public Template。
- 本公开spec只保留视觉参数和Renderer规则。
- 用户新地图默认也是private Trip Asset；只有获得明确授权后才可发布为Demo。
- 不得根据公开spec尝试还原被移除的私人Golden map。

## 15. Acceptance

新地图可以有不同region与内容，但必须验证：

- route double stroke、palette、round caps/joins；
- marker、label、heading、legend层级；
- Overview/Daily显示规则；
- place与transport交互；
- responsive map shell与fullscreen；
- 每个目的地国家都有且只有一个对应Map Package，国家标签切换不会串用其他国家的asset或route；
- boundary来源/许可已记录且国家轮廓不是手画近似；
- canonical geo Places投影在正确国家/区域，已知地点没有被泛化城市点吞并；
- Overview 路线顺序与行程一致，Daily 只切换路线与相关地点，不改变整图视口；
- Day/Place/Transport使用stable ID引用，没有schedule index或display-text identity；
- 无私人Golden asset/query/date/route残留。
