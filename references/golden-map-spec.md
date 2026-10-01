# Golden Map Specification: Fixed Template Edition

状态：普通生成唯一地图规范。

## 1. 核心目标

普通 Agent 不生成地图背景，也不绘制国家、城市或行政区轮廓。所有旅行地图由十张固定底图之一与固定 SVG 叠加层组成。不同旅行只改变地点的相对位置、访问顺序、每日路线和文字内容。

地图是模板化行程示意图，不代表真实比例或精确地理边界。

## 2. 冻结底图

模板清单位于 `assets/maps/templates/manifest.json`。十张底图统一使用 `1448 x 1086`、4:3 画布，并固定纸张纹理、低饱和配色、地形、水体、山林、城市线稿、构图留白及每张模板的路线安全区域。Manifest 的运行时路径全部指向 WebP。底图自身不得包含旅行标题、图例、路线、节点或地点标签。

普通生成不得修改、覆盖或重新生成底图。

## 3. 自动模板选择

- 紧凑/高密度：跨度小于 45 km，或至少 6 个地点且平均最近距离小于 12 km，候选池为 `urban-radial` / `compact-basin` / `upland-basin`；
- 分离簇/长跳转：路线连通分量多于 1，或最长路段超过 160 km 且它与路段中位数的比值大于 2.8，候选池为 `island-archipelago` / `river-highland` / `broad-riverland`；
- 南北向：南北跨度大于东西跨度的 1.1 倍，候选池为 `coastal-region` / `radial-watershed` / `compact-basin`；
- 东西向：东西跨度大于南北跨度的 1.3 倍，候选池为 `inland-alpine` / `wide-valley` / `broad-riverland`；
- 其余均衡路线：候选池为 `inland-alpine` / `river-highland` / `upland-basin` / `compact-basin` / `broad-riverland`。

Builder 按上述顺序确定候选池，再对区域、地点 ID 和路线顺序组成的旅行签名做稳定哈希，从池内选出一张；同一输入的结果始终相同。Manifest 的 `selectionRole` 是维护说明，不是 Builder 直接解析的规则。

`trip-data.json > map.mapMode` 在普通生成中固定为 `template-auto`，`map.templateId` 固定为 `auto`。Builder 生成的 `routeMap.regions[].mapMode` 为 `frozen-template`；这是派生输出，不得写回输入的 `map.mapMode`。显式模板 ID 只允许在用户后续 DIY 时使用。

地图按目的地分区，而不是按完整航班链路分区。出发国、返程终点国和纯转机国家不在 `trip.primaryDestinationCountries` 中时，其机场不进入地图；目的地境内的抵达机场继续作为路线起点。跨国航段永远不绘制路线。

多国旅行必须生成多个 `routeMap.regions[]`。每个 Region 独立选择底图、布局地点和绘制境内路线，不得把两个国家的地点合并到一张地图。跨国移动当天由抵达目的地的 Region 承接 Daily Map。

## 4. 相对位置布局

地点经纬度只用于确定相对方位和距离关系。Builder 使用统一比例将全部地点一次性映射到模板安全区域，再执行有限的确定性疏散。

- 北方保持在上方，东方保持在右侧；
- 紧凑旅行允许整体放大；
- 节点使用固定最小间距并受安全区域限制；
- 疏散后向原始投影位置回拉，避免方向关系颠倒；
- 同一输入始终得到相同坐标；
- Overview 与所有 Daily 复用同一组最终坐标。

缺少经纬度时使用确定性备用布局，但 `validate-lite` 必须给出警告。

## 5. 冻结视觉

- 路线 `fill:none`，round linecap 与 linejoin；
- 主路线宽度 `7`，白色半透明内层宽度 `2`、透明度 `.22`；
- 固定六色：`#397dc1`、`#e77e22`、`#618344`、`#209aaa`、`#8865a5`、`#df6185`；
- 固定三次贝塞尔曲线规则，不使用随机曲线；
- Overview 节点半径 `10.5`，白色边框 `2.5`；
- 字体为 Times serif 与中文楷体、宋体回退组合；
- 标签使用深蓝 `#092653`、字重 `700`、描边 `0.4`；
- 标题固定左上角，默认 `40/700`；
- 图例透明无卡片，固定色条、字号、间距和位置。

Agent 不得直接填写 SVG path、节点坐标或自由调整样式。

## 6. Overview 与 Daily

Overview 最多显示 10 个核心地点。超过时，Builder 根据起终点、跨日出现次数和路线中点选择核心地点，并使用简化路线减少拥挤。Daily 使用当天完整路线与地点。

Overview 与 Daily 必须保持相同底图、canvas、viewBox、scale、地点坐标和模板位置。Day 切换只改变路线、当天地点、标签和交通 pin 的可见性。禁止 fitBounds、zoom-to-route、crop-to-day 或任何 Daily 重投影。

## 7. 普通 Agent 边界

普通 Agent 只写 `trip-data.json > map` 中的地点、经纬度、顺序、每日路线、名称和 query。不得调用图片模型、读取 Boundary Library、下载地图、设计背景、选择配色或绕过 `build-map.mjs`。

Boundary Library 和旧国家轮廓生成实现只作为 `references/advanced/` 参考保留，不属于普通生成链路。

## 8. 固定说明

Overview 地图下方必须显示：

“本图为模板化行程示意图，仅表达地点的相对方位与路线顺序，不代表真实比例或精确地理边界。如需使用真实国家或城市地图，可在生成后自行调整。”

## 9. 验收条件

- 十张底图均可由 Builder 读取；
- 模板选择和地点布局确定性；
- 地点方向关系基本正确，密集地点不会全部重叠；
- 路线、节点、字体、标题与图例保持 Golden token；
- Overview 使用核心地点，Daily 使用当天详细地点；
- Overview 与 Daily 的地图范围和地点坐标完全一致；
- 普通生成不读取 Boundary、不生成新底图、不调用图片模型。
