# Map Boundary Matrix — Public Template

状态：Advanced/legacy Boundary 流程说明；不属于普通单文件生成流程。

| Source | Responsibility | Classification | Per-trip editable? | Main guardrail |
|---|---|---|---:|---|
| `index.html` | route section与dialog shell | FROZEN CORE | No | 通过Config隐藏，不删除DOM |
| `styles.css` | viewport、响应式、route/point/label视觉 | FROZEN MAP STYLE | No | 保持Golden computed result |
| `overview-map.js` | SVG layer composition与package rendering | MAP RENDERER | No | 不含国家/城市特判 |
| `route-ui.js` | Overview/Day、popover、fullscreen交互 | MAP INTERACTION | No | 不从display text猜identity |
| `scripts/generate-map-package.mjs` | boundary投影、routes、labels、Daily bounds/layouts/pins | MAP GENERATOR | No | 相同输入可复现；无手工geometry |
| `schemas/*.json` | Map source/output与reference约束 | CORE CONTRACT | No | 单次生成不能放宽Schema |
| authorized GeoJSON | 准确国家boundary及source/license | PRIVATE BUILD INPUT / LICENSED SOURCE | Input only | 不复制来源不明数据；不含Trip路线 |
| private canonical Places/Days/Transport | 地点经纬度与语义顺序 | PRIVATE BUILD INPUT | Input only | stable ID、typed reference、one source |
| `travel-data.json` | compiler输出的Renderer视图 | GENERATED TRIP DATA | Generated only | 不人工拼接canonical与region shape |
| generated region JSON | routes、projected places、labels、daily layouts/bounds | GENERATED TRIP DATA | Generated only | 不由Agent手调 |
| generated `*-base.svg` | Golden风格国家底图 | GENERATED TRIP ASSET | Generated only | 轮廓来自boundary；保留source/license metadata |
| navigation query / private address | 地点交互目标 | PRIVATE TRIP VALUE | Yes | 仅进入用户Trip；发布前审查 |
| pure country base cache | 无Trip内容的boundary/style输出 | PUBLIC-SAFE CACHE | Reusable | 不得包含地点、路线、日期、地址或query |
| private Golden map package | 私人路线、坐标、queries、assets | PRIVATE FIXTURE | No | 永不复制到Public Template |

## Reusable Core

- SVG layer renderer；
- Frozen route/point/label/legend visual grammar；
- Overview/Day切换；
- place/transport popover；
- fullscreen与responsive shell；
- deterministic projection、route、label和Daily bounds generation；
- icon registry和交互事件。

## Per-trip source and generated output

用户或Agent只提供/确认：

- `trip.primaryDestinationCountries`；
- canonical Places的country code与geo；
- Day/Transport/Place访问顺序与stable references；
- 获授权的boundary source；
- navigation query与特殊地点option。

Generator派生：

- country base SVG；
- projected x/y；
- route paths和颜色分配；
- label placement；
- Daily layouts、bounds和transport pins；
- Map Package metadata与source/license记录。

单次生成不允许修改Core或手调这些派生geometry。若输出不能满足任务，先报告generator缺口，再在独立框架维护任务中修改和回归。
