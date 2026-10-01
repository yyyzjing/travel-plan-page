# Data Migration Map — Historical to Standard Generator

状态：框架维护参考，不是单次Trip生成清单。  
普通现行流程：根目录 `SKILL.md`；本文仅用于 advanced/canonical 兼容。

本文记录旧手工B-Template字段如何归入Config、canonical data、generated assets与runtime state。不得因读取本文而修改某位用户的Core。

## 1. Disposition vocabulary

| Disposition | Meaning |
|---|---|
| `CONFIG` | 进入`trip-config.json`，由用户确认 |
| `CANONICAL` | 进入仓库外 canonical build input 的唯一事实源；再由 compiler 生成 `travel-data.json` |
| `REFERENCE` | 用stable typed ID关联 |
| `DERIVE` | 由build/renderer生成，不再人工维护 |
| `PRESENTATION` | 仅保持Golden显示文案，不参与identity |
| `RUNTIME` | 运行后状态，默认浏览器local |
| `GENERATE` | 由deterministic map/build tool输出 |
| `PRIVATE INPUT` | 仅留在仓库外的Source Facts/原始资料 |

## 2. Module and deployment decisions

| Old concern | Current owner | Disposition |
|---|---|---|
| 手工删除section/nav/init | `trip-config.json > modules` | `CONFIG` |
| 组件自行判断是否存在内容 | Config + validator | `CONFIG` / `DERIVE` |
| 默认请求shared API | `trip-config.json > persistence` | `CONFIG`; default local |
| Pages/D1绑定信息 | 用户Cloudflare项目 | 不进入仓库 |

## 3. Core trip facts

| Old concern | Current owner | Disposition |
|---|---|---|
| 重复Trip ID | canonical Trip ID | `CANONICAL` / `REFERENCE` |
| 手写日期范围/day count | Days/events | `DERIVE` |
| 重复Place/address/query | Place entity | `CANONICAL` |
| schedule文字识别Place/Ticket | Day Item typed refs | `REFERENCE` |
| schedule index识别Transport | Transport/Day Item IDs | `REFERENCE` |
| 固定机场offset或租车offset | zoned endpoint/event | `CANONICAL` |
| display route/duration/summary | canonical facts | `DERIVE` or `PRESENTATION` |
| 原始订单、PDF、OCR | private workspace | `PRIVATE INPUT` |

## 4. Map

| Old concern | Current owner | Disposition |
|---|---|---|
| 手写国家轮廓 | authorized boundary GeoJSON + generator | `GENERATE` |
| 人工x/y | Place geo + projection | `GENERATE` |
| 人工route SVG | ordered Place/Transport refs | `GENERATE` |
| 人工label anchor | deterministic default label layout | `GENERATE` |
| Daily复用整国尺度 | Day places + generated bounds | `GENERATE` |
| schedule index pins | Transport/Day Item refs | `REFERENCE` / `GENERATE` |
| 私人Golden map | private fixture | 永不迁入Public Template |

生成结果可以缓存于该Trip的assets/data；公共cache只能保存不含Trip地点、路线、日期、地址或query的纯country base。

## 5. Tickets, Todo and Ledger

| Concern | Current owner | Disposition |
|---|---|---|
| Ticket booking/document facts | Ticket entity | `CANONICAL` |
| Ticket displayed in a day | Day Item `ticketIds[]` | `REFERENCE` |
| Ticket completion | Runtime storage | `RUNTIME` |
| User-added Todo | Runtime storage | `RUNTIME` |
| Static preparation guidance | Trip/pre-trip facts | `CANONICAL` |
| Travelers, bills, settings | Runtime storage | `RUNTIME` |

Default runtime storage is localStorage by Trip ID, with in-memory fallback. Only explicit D1 mode and `sharedCollections` may send selected state to the user's D1.

## 6. Framework-maintenance gate

Changing schemas, adapters, Core files, generators or migration logic requires a dedicated framework task that:

1. states the contract being changed;
2. updates code and corresponding reference once;
3. runs Golden behavior/UI/map/Ledger regressions;
4. validates privacy and Demo neutrality;
5. only then regenerates `schemas/core-integrity.json` with `node scripts/validate-generation.mjs freeze`.

A normal user-trip task must stop at validator failure and report the framework gap. It must never run `freeze` to hide drift.
