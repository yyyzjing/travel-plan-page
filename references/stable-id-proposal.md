# Stable ID Convention

状态：Standard Generator关系约束；具体可执行要求以当前Schema与validator为准。  
用途：避免文字匹配和数组索引关联。本文示例均为虚构值。

## 1. Current Generator Rule

- canonical Trip ID是唯一Trip ID；
- 已存在的flight、journey、stay、ticket、place、day/item与transport ID不得因显示文案、日期或排序变化而改名；
- 新ID清晰、唯一、稳定且不包含私人敏感信息；
- Day Item通过typed IDs引用Place、Ticket与Transport；
- Map直接引用Day、Place、Transport与Map Segment IDs；
- validator拒绝schedule/day array index、substring、match terms或display name充当Core-facing identity。

## 2. Naming convention

- lowercase ASCII kebab-case；
- 带type prefix；
- 首次mint后不因name、language、date或sorting改变；
- readable slug是初始提示，不是每次重算公式；
- object map key可作为canonical ID，value不再重复漂移的`id`。

示例：

```text
entities.places["place-demo-airport"]
days[].items[].placeId = "place-demo-airport"
map.layouts.places["place-demo-airport"]
```

## 3. ID class catalog

| # | Class | Suggested prefix | Fictional example |
|---:|---|---|---|
| 1 | Trip | `trip-*` | `trip-demo-aster-isles` |
| 2 | Day | `day-*` | `day-demo-arrival` |
| 3 | Day Item | `item-*` | `item-demo-airport-arrival` |
| 4 | Place | `place-*` | `place-demo-airport` |
| 5 | Stay | `stay-*` | `stay-demo-bay-001` |
| 6 | Flight | `flight-*` | `flight-demo-gl101` |
| 7 | Flight Group | `journey-*` / `flight-group-*` | `journey-demo-outbound` |
| 8 | Carrier | `carrier-*` | `carrier-demo-glimmer` |
| 9 | Ticket | `ticket-*` | `ticket-demo-museum` |
| 10 | Transport | `transport-*` | `transport-demo-ferry-out` |
| 11 | Rental | `rental-*` | `rental-demo-001` |
| 12 | Restaurant | `restaurant-*` | `restaurant-demo-bistro` |
| 13 | Pre-trip Item | `prep-*` / `pack-*` | `pack-demo-documents` |
| 14 | Map Region | `map-region-*` | `map-region-demo-country` |
| 15 | Map Route | `map-route-*` | `map-route-demo-day2` |
| 16 | Map Segment | `map-segment-*` | `map-segment-demo-bay-harbor` |
| 17 | Map Feature | `map-feature-*` | `map-feature-demo-ferry-pin` |
| 18 | Issue | `issue-*` | `issue-demo-time-unconfirmed` |

Runtime Todo IDs不属于静态Trip Package；多设备并发ID策略应在专门的Runtime State工作中决定。

## 4. Typed references

Day Item按需要显式引用：

| Field | Target |
|---|---|
| `placeId` / `placeIds` | Place |
| `stayId` | Stay |
| `flightId` | Flight |
| `ticketIds` | Tickets |
| `transportId` | Transport |
| `rentalId` | Rental |
| `restaurantId` | Restaurant |
| `issueIds` | Issues |

Flight Group可拥有ordered `flightIds[]`；Flight不再同时保存group membership和sequence。Map可直接引用Day、Place、Transport与Map Segment IDs。

## 5. Relations an Upgrade Should Remove

- `schedule[index]`或`days[index]`作为跨模块identity；
- numeric day number作为唯一关系键；
- `scheduleMatchTerms`、`matchTerms`和substring entity lookup；
- 从display name动态生成restaurant/entity ID；
- SVG child order决定route branch；
- destination/day-specific name conditions。

Arrays仍可表达显示顺序，strings仍可用于标题、说明和provider query；禁止的是用它们隐式发现identity。

## 6. Validation

validator至少检查：

- ID格式和collection内唯一性；
- typed reference存在且类型正确；
- Day Item ID在Trip内唯一；
- ordered reference array无重复；
- map/day/place/transport/segment引用全部可解析；
- display text修改不会改变entity selection。

## 7. Implementation boundary

Schema可以分阶段支持上述ID classes，但单次Trip生成不得通过修改Renderer或放宽validator来容纳例外。需要新增entity type或关系时，记录为独立框架维护任务，并包含data adapter、behavior regression、map regression与rollback。
