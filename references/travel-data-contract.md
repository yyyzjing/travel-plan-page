# Target Travel Data Contract

状态：Advanced/legacy canonical data contract；不属于普通单文件生成流程。  
用途：定义Trip Package中旅行事实的规范化边界；单次生成只填写数据，不修改Core来绕开合同。  
上位合同：`golden-contract.md`  
配套文档：`data-duplication-matrix.md`、`stable-id-proposal.md`、`data-migration-map.md`

## 1. Contract Principles

1. **One Fact, One Authoritative Source**：同一旅行事实只有一个可编辑来源；其他视图从该来源派生。
2. **Identity is explicit**：实体与跨模块关系使用 stable ID，不使用数组位置、显示文字或 substring 推断。
3. **Display text is presentation**：`title`、`text`、`note` 可以保留 Golden 文案，但不得承担 identity。
4. **Trip facts are immutable input**：Todo、Ticket completion、Ledger 等用户使用后状态不写回本合同。
5. **Normalized Core is destination-neutral**：Core不得识别具体国家、城市、Day编号或地点名；目的地差异通过canonical data和generated assets表达。
6. **Golden fixture remains lossless**：迁移当前数据时，所有现有可见内容、顺序、地图 geometry 和交互入口均须可表达。
7. **Public structure, private values**：字段结构可以开源；真实旅行内容默认是私人值，不得因结构公开而发布。

## 2. Notation

- `[PUBLIC-SAFE STRUCTURE]`：字段名、类型、枚举和关系规则可进入公开 Core、Schema 与文档。
- `[PRIVATE VALUE]`：当前真实行程中的值默认留在 Private Trip Package；包括日期、路线、地址、订单、金额和私人 query。
- `[REQUIRED]`：规范化 Trip Package 必须提供。
- `[OPTIONAL]`：仅在事实存在或模块需要时提供。
- `[DERIVED]`：由 validator/build step 计算，禁止作为第二个可编辑事实源。
- `[REFERENCE]`：值必须解析到指定 stable ID class。
- `[FIXTURE PRESENTATION]`：为保持当前 Golden 文案而允许保留；只用于显示，不参与关联。

本文以 TypeScript-like notation 表达逻辑模型。对象索引键就是 canonical ID；对象值中不再重复 `id`。

## 3. Top-level Shape

```ts
type TravelData = {
  schemaVersion: string;
  trip: Trip;
  entities: {
    places: Record<PlaceId, Place>;
    stays: Record<StayId, Stay>;
    flights: Record<FlightId, Flight>;
    flightGroups: Record<FlightGroupId, FlightGroup>;
    carriers: Record<CarrierId, Carrier>;
    tickets: Record<TicketId, Ticket>;
    transport: Record<TransportId, Transport>;
    rentals: Record<RentalId, Rental>;
    restaurants: Record<RestaurantId, Restaurant>;
  };
  days: Day[];
  map?: TripMap;
  preTrip?: { items: Record<PreTripItemId, PreTripItem> };
  issues?: Record<IssueId, TripIssue>;
};
```

`entities` 中的九类一级旅行实体是本轮的目标集合。空类别使用空 object；不得为渲染方便复制同一实体。

## 4. Common Scalar Types

```ts
type StableId = string;          // lowercase ASCII kebab-case, prefix required
type LocalDate = string;         // YYYY-MM-DD
type LocalTime = string;         // HH:mm or HH:mm:ss
type IanaTimeZone = string;      // e.g. Europe/Paris; validator checks IANA name
type CurrencyCode = string;      // ISO 4217 uppercase code
type MinorAmount = number;       // positive safe integer in currency minor units
type CountryCode = string;       // ISO 3166-1 alpha-2 uppercase code
type LocaleTag = string;         // BCP 47
type GeoPoint = { lat: number; lng: number };
```

共同约束：

- 日期与时间不得仅用 locale-dependent display string 表达。
- 航班起降、住宿入住/退房、租车取还车各自拥有发生地 `timeZone`。
- 金额的权威值使用整数 minor units；显示字符串与货币符号由 Core 派生。
- 能从实体计算的 duration、route text、night count 与 day count 不重复存储。

## 5. Trip

| Field | Type | Rule | Ownership / visibility |
|---|---|---|---|
| `id` | `TripId` | `[REQUIRED]` canonical trip identity；Todo、Ticket与Ledger namespace从此派生，显式shared mode才用于API/D1分区 | 结构公开；当前值 `[PRIVATE VALUE]` |
| `title` | `string` | `[REQUIRED]` 页面主标题 | 当前值 `[PRIVATE VALUE]` |
| `language` | `LocaleTag` | `[REQUIRED]` 内容主语言；运行方式仍由 Config 决定 | 通常可公开，当前值仍属 Trip Package |
| `startDate` | `LocalDate` | `[DERIVED]` 取最早 day/date 或显式 event date | `[PRIVATE VALUE]` |
| `endDate` | `LocalDate` | `[DERIVED]` 取最晚 day/date 或显式 event date | `[PRIVATE VALUE]` |
| `dayCount` | `number` | `[DERIVED]` 从 `days` 计算 | `[PRIVATE VALUE]` |
| `countries` | `CountryCode[]` | `[DERIVED]` 从 referenced places 计算，顺序由首次行程出现确定 | `[PRIVATE VALUE]` |
| `primaryDestinationCountries` | `CountryCode[]` | `[OPTIONAL]` 产品语义，不总能从地点推断 | `[PRIVATE VALUE]` |
| `groupSize` | `number` | `[OPTIONAL]` 行程规划人数，不等同 Ledger travelers | `[PRIVATE VALUE]` |
| `status` | enum | `[OPTIONAL]` `draft | confirmed | completed | cancelled` | `[PRIVATE VALUE]` |
| `subtitle` | `string` | `[OPTIONAL]` `[FIXTURE PRESENTATION]` | `[PRIVATE VALUE]` |

下列现有字段不再作为可编辑权威字段：`nightCountAway`、`citiesAndAreas`、`routeSummary`。需要时由 Core/validator 生成 display view。

## 6. Entities

### 6.1 Place

`entities.places: Record<PlaceId, Place>` 是所有真实物理地点和导航目标的权威目录。

| Field | Type | Rule |
|---|---|---|
| `name` | `string` | `[REQUIRED]` 默认显示名称 |
| `localizedNames` | `Record<LocaleTag, string>` | `[OPTIONAL]` 翻译名称，不是别名关联表 |
| `category` | enum/string | `[REQUIRED]` 如 `country-region | city | airport | station | stay-premise | attraction | restaurant | rental-office | parking | other` |
| `countryCode` | `CountryCode` | `[OPTIONAL]` region 级抽象点可以省略 |
| `geo` | `GeoPoint` | `[OPTIONAL]` schematic map 或 provider link 需要时提供 |
| `address` | `string` | `[OPTIONAL]` `[PRIVATE VALUE]`；只在 Place 保存一次 |
| `codes` | object | `[OPTIONAL]` 如 airport IATA/ICAO、station/provider code |
| `navigation` | provider map | `[OPTIONAL]` provider-specific query/place ID/URL；当前真实 query `[PRIVATE VALUE]` |
| `description` | `string` | `[OPTIONAL]` 显示信息，不用于关联 |
| `privacy` | enum | `[OPTIONAL]` `public | private | sensitive`；缺省按 `private` 处理真实 Trip Package |

约束：

- 机场、车站、酒店实际地点、餐厅、景点、租车门店和停车点均是 Place。
- Stay、Restaurant、Rental 不重复保存其地址或导航 query。
- 一个概念地图点需要打开多个真实地点时，Map Feature 使用 `placeId + interactionPlaceIds[]`；不得把多个地点压成一个混合 Place。

### 6.2 Stay

| Field | Type | Rule |
|---|---|---|
| `name` | `string` | `[REQUIRED]` 住宿订单显示名称 |
| `placeId` | `PlaceId` | `[REQUIRED][REFERENCE]` 住宿实际地点 |
| `checkIn` | `LocalEvent` | `[REQUIRED]` date/time/timeZone；未知具体时间可使用 precision |
| `checkOut` | `LocalEvent` | `[REQUIRED]` 同上 |
| `provider` | `string` | `[OPTIONAL]` 预订平台/酒店渠道 |
| `bookingStatus` | enum/string | `[OPTIONAL]` |
| `guestCount` | `number` | `[OPTIONAL]` |
| `room` | object | `[OPTIONAL]` 房型、早餐、设施等事实 |
| `price` | `Money` | `[OPTIONAL][PRIVATE VALUE]` |
| `confirmation` | object | `[OPTIONAL][PRIVATE VALUE]` 订单号、联系人、访问说明 |
| `notes` | `string[]` | `[OPTIONAL][PRIVATE VALUE]` |

`nightCount` 为 `[DERIVED]`；address 与 navigation 从 `placeId` 获取。

### 6.3 Carrier

| Field | Type | Rule |
|---|---|---|
| `name` | `string` | `[REQUIRED]` |
| `localizedNames` | map | `[OPTIONAL]` |
| `codes` | object | `[OPTIONAL]` IATA/ICAO/rail operator code |

Carrier 目录消除每段航班内重复的 airline object。品牌 logo 若存在属于 asset/config boundary，不嵌入身份字段。

### 6.4 Flight

```ts
type FlightEndpoint = {
  placeId: PlaceId;
  localDate: LocalDate;
  localTime: LocalTime;
  timeZone: IanaTimeZone;
  terminal?: string;
};
```

| Field | Type | Rule |
|---|---|---|
| `carrierId` | `CarrierId` | `[REQUIRED][REFERENCE]` |
| `flightNumber` | `string` | `[REQUIRED]` |
| `departure` | `FlightEndpoint` | `[REQUIRED]` endpoint Place 应为 airport |
| `arrival` | `FlightEndpoint` | `[REQUIRED]` endpoint Place 应为 airport |
| `status` | enum/string | `[OPTIONAL]` booking/operational planning status |
| `cabin` | `string` | `[OPTIONAL]` |
| `booking` | object | `[OPTIONAL][PRIVATE VALUE]` PNR、ticket number 等 |
| `price` | `Money` | `[OPTIONAL][PRIVATE VALUE]` leg-level price only |
| `notes` | `string[]` | `[OPTIONAL]` |
| `issueIds` | `IssueId[]` | `[OPTIONAL][REFERENCE]` |

route、duration、跨日标记、airport name/city/country 均 `[DERIVED]`。Flight 不再保存 `journeyId` 或 `sequence`；分组顺序由 Flight Group 的 `flightIds[]` 表达。

若用户保留航班模块，但关键航班材料缺失，并在第二轮选择继续预览，该实体改用明确的 missing union：

```ts
type MissingFlight = {
  status: "missing";
  title: string;
  missingFields: string[];
  issueIds: IssueId[];
};
```

Missing Flight 不得同时填入猜测的 `carrierId`、`flightNumber`、`departure` 或 `arrival`。Compiler 只会生成不带倒计时的待补充卡；`issueIds` 必须指向已被第二轮接受继续预览的 Issue。

### 6.5 Flight Group

当前数据存在 group-only booking facts，因此保留轻量 `flightGroups`，而不是把所有 group 都当作纯派生视图。

| Field | Type | Rule |
|---|---|---|
| `flightIds` | `FlightId[]` | `[REQUIRED][REFERENCE]` 有意义的有序数组；每个 ID 只出现一次 |
| `title` | `string` | `[OPTIONAL][FIXTURE PRESENTATION]` |
| `bookingStatus` | enum/string | `[OPTIONAL]` |
| `travelerCount` | `number` | `[OPTIONAL]` |
| `fare` | `Money` | `[OPTIONAL][PRIVATE VALUE]` group-level fare only |
| `notes` | `string[]` | `[OPTIONAL]` group-level facts only |

route、stops、departure、arrival、total duration 与 leg count 均 `[DERIVED]`，不得与 Flight 再维护一份。

### 6.6 Ticket

| Field | Type | Rule |
|---|---|---|
| `name` | `string` | `[REQUIRED]` |
| `category` | enum/string | `[OPTIONAL]` attraction/transport/pass/reservation 等 |
| `requirement` | enum/string | `[OPTIONAL]` booking/entry requirement |
| `initialStatus` | enum | `[OPTIONAL]` `needed | planned | booked | not-needed`；不是用户完成状态 |
| `placeIds` | `PlaceId[]` | `[OPTIONAL][REFERENCE]` ticket 覆盖的地点 |
| `transportIds` | `TransportId[]` | `[OPTIONAL][REFERENCE]` ticket 覆盖的交通 leg |
| `validity` | object | `[OPTIONAL]` date/time/timeZone 或日期范围 |
| `price` | `Money` | `[OPTIONAL][PRIVATE VALUE]` |
| `booking` | object | `[OPTIONAL][PRIVATE VALUE]` provider、confirmation、document asset ref |
| `guidance` | `string[]` | `[OPTIONAL]` |
| `issueIds` | `IssueId[]` | `[OPTIONAL][REFERENCE]` |

Ticket 不保存 `day`、`scheduleMatchTerms` 或完成 boolean。出现在哪个 itinerary item 由 `item.ticketIds[]` 指定；用户勾选结果属于 Runtime State，以 `ticketId` 为 key。

### 6.7 Transport

| Field | Type | Rule |
|---|---|---|
| `mode` | enum/string | `[REQUIRED]` `drive | rail | metro | bus | boat | cable-car | walk | transfer | other` |
| `fromPlaceId` | `PlaceId` | `[OPTIONAL][REFERENCE]` |
| `toPlaceId` | `PlaceId` | `[OPTIONAL][REFERENCE]` |
| `viaPlaceIds` | `PlaceId[]` | `[OPTIONAL][REFERENCE]` travel order |
| `departure` | `LocalEvent` | `[OPTIONAL]` |
| `arrival` | `LocalEvent` | `[OPTIONAL]` |
| `durationMinutes` | `number` | `[OPTIONAL]` only when authored fact; otherwise `[DERIVED]` |
| `operatorId` | `CarrierId` | `[OPTIONAL][REFERENCE]` |
| `service` | object | `[OPTIONAL]` train number、route name、reservation rule |
| `rentalId` | `RentalId` | `[OPTIONAL][REFERENCE]` drive leg 使用的租车订单 |
| `status` | enum/string | `[OPTIONAL]` planning status |
| `notes` | `string[]` | `[OPTIONAL]` |
| `issueIds` | `IssueId[]` | `[OPTIONAL][REFERENCE]` |

Road leg 与 public-transit row 统一为 Transport entity。Day item 引用它；schedule text、map pin 和 cost tag 不再各写一份。

### 6.8 Rental

| Field | Type | Rule |
|---|---|---|
| `provider` | `string` | `[REQUIRED]` 当前品牌属于 Trip Data，不属于 Core |
| `pickup` | `RentalEvent` | `[REQUIRED]` `placeId + localDate + localTime + timeZone` |
| `dropoff` | `RentalEvent` | `[REQUIRED]` 同上 |
| `vehicle` | object | `[OPTIONAL]` class/model/transmission/fuel facts |
| `bookingStatus` | enum/string | `[OPTIONAL]` |
| `price` | `Money` | `[OPTIONAL][PRIVATE VALUE]` |
| `booking` | object | `[OPTIONAL][PRIVATE VALUE]` confirmation/contact |
| `requirements` | `string[]` | `[OPTIONAL]` |
| `notes` | `string[]` | `[OPTIONAL]` |
| `issueIds` | `IssueId[]` | `[OPTIONAL][REFERENCE]` |

Rental 的门店地址和 provider query 位于 referenced Place。倒计时直接使用 pickup/dropoff events，不读取 HTML 文案或固定 UTC offset table。

### 6.9 Restaurant

Restaurant 保留为一级实体，因为餐厅可能同时参与日程、预订准备和导航。

| Field | Type | Rule |
|---|---|---|
| `placeId` | `PlaceId` | `[REQUIRED][REFERENCE]` name/address/navigation 由 Place 提供 |
| `status` | enum/string | `[OPTIONAL]` planned/reserved/walk-in/cancelled |
| `mealKinds` | `string[]` | `[OPTIONAL]` |
| `specialties` | `string[]` | `[OPTIONAL]` |
| `reservation` | object | `[OPTIONAL][PRIVATE VALUE]` date/time/provider/confirmation |
| `notes` | `string[]` | `[OPTIONAL]` |

## 7. Day and Daily Item

```ts
type Day = {
  id: DayId;
  sequence: number;
  date: LocalDate;
  title: string;
  subtitle?: string;
  stayId?: StayId;
  items: DayItem[];
  notes?: string[];
};
```

### 7.1 Day Rules

- `[REQUIRED]` `id`、`sequence`、`date`、`title`、`items`。
- `sequence` 只决定展示顺序，不是 identity；不得由 `days[4]` 表示 Day 5。
- `stayId` 表示该日结束后的住宿。无住宿或跨夜交通时可以省略。
- `weekday`、`locations`、`costReferences`、ticket pending count 均 `[DERIVED]`。
- `items` 是有意义的有序数组；每一项仍有独立 `DayItemId`。

### 7.2 Day Item

```ts
type DayItem = {
  id: DayItemId;
  type: string;
  time: ItemTime;
  title: string;
  text?: string;
  note?: string;
  tag?: string;
  placeId?: PlaceId;
  placeIds?: PlaceId[];
  stayId?: StayId;
  flightId?: FlightId;
  ticketIds?: TicketId[];
  transportId?: TransportId;
  rentalId?: RentalId;
  restaurantId?: RestaurantId;
  issueIds?: IssueId[];
};
```

每个 normalized Day Item 还必须暴露有效 `date`。为保持 One Fact：

- serialized package 以 parent `Day.date` 为唯一权威日期；item 不重复写相同日期；
- normalize step 将 `effectiveDate = day.date` materialize 给 Core；
- 只有真正跨日且 event entity 不能表达时，item 才允许 `dateOverride`，并必须通过 validator 说明原因；
- 因此 Core contract 中 item 有明确 date，但 raw JSON 不维护第二份相同事实。

`ItemTime` 支持三种表达：

```ts
type ItemTime =
  | { kind: "entity-event"; event: "departure" | "arrival" | "check-in" | "check-out" | "pickup" | "dropoff" }
  | { kind: "local"; localTime: LocalTime; timeZone?: IanaTimeZone; precision?: "exact" | "approximate" }
  | { kind: "label"; label: string };
```

- `entity-event` 必须能由同一 item 的 `flightId`、`stayId` 或 `rentalId` 唯一解析。
- `label` 只用于“上午/全天/抵达后”等非精确事实，不得伪装成可计算时间。
- `title` 是 `[REQUIRED]` 结构化摘要。
- `text`、`note`、`tag` 可保留当前 Golden 文案，但均为 `[FIXTURE PRESENTATION]`；Renderer 不得从其中查找实体。

### 7.3 Type-specific Reference Constraints

| Item type | Required semantic reference |
|---|---|
| flight departure/arrival | exactly one `flightId`; `time.kind=entity-event` preferred |
| stay check-in/check-out | exactly one `stayId`; related `placeId` derived from Stay |
| transport | exactly one `transportId` |
| rental pickup/dropoff | exactly one `rentalId`; event identifies pickup/dropoff |
| restaurant meal | exactly one `restaurantId`; `placeId` derived from Restaurant |
| attraction/activity | at least one `placeId` or `placeIds`; optional `ticketIds[]` |
| free note/rest | no entity ref required |

Typed references may coexist when semantically necessary，例如 transport item 同时关联 `ticketIds[]`；不得为 renderer 便利建立反向重复关系。

## 8. Trip Map Contract

Map Data 引用相同 Place、Transport、Day IDs；不得创建第二套地点 identity。

```ts
type TripMap = {
  mode: "custom-artwork" | "schematic";
  regions: Record<MapRegionId, MapRegion>;
  routes: Record<MapRouteId, MapRoute>;
  segments: Record<MapSegmentId, MapSegment>;
  customLayout?: CustomMapLayout;
  schematicInput?: SchematicMapInput;
};
```

### 8.1 Shared semantic layer

| Field | Type | Rule |
|---|---|---|
| `regions[*].title` | `string` | display only |
| `regions[*].countryCodes` | `CountryCode[]` | semantic region coverage |
| `routes[*].regionId` | `MapRegionId` | `[REFERENCE]` |
| `routes[*].dayId` | `DayId` | `[OPTIONAL][REFERENCE]` |
| `routes[*].segmentIds` | `MapSegmentId[]` | meaningful render order |
| `routes[*].colorKey` | `string` | Trip assignment to Frozen palette, not raw CSS override by default |
| `segments[*].fromPlaceId` | `PlaceId` | `[OPTIONAL][REFERENCE]` |
| `segments[*].toPlaceId` | `PlaceId` | `[OPTIONAL][REFERENCE]` |
| `segments[*].transportIds` | `TransportId[]` | `[OPTIONAL][REFERENCE]` |

### 8.2 `custom-artwork` （旧 Fixture / 单独批准的精修模式）

该模式只用于无损保留已批准的旧 Golden fixture，或用户在标准首版之后单独批准的地图精修。普通单次生成不能进入此模式手调坐标。获批的 Trip Map Package 可以提供：

- canvas width/height/viewBox；
- region artwork asset reference；
- route SVG paths；
- per-place x/y、label x/y、anchor、size、multiline；
- geographic annotations、heading、legend placement；
- daily layout keyed by `dayId`；
- place feature keyed by `MapFeatureId`，含 `placeId`、`role`、`interactionPlaceIds[]`；
- transport pin keyed by `MapFeatureId`，含 `transportIds[]` 和 manual x/y；
- `visibleRouteSegmentIds[]`，替代 SVG child position。

这些字段属于 `[CUSTOM TRIP ASSET]` 或 `[GOLDEN MAP FIXTURE]`。任一获准保留的 Golden Map Package 输入不变时，必须产生对应的 Golden result。

### 8.3 `schematic`

允许的 authored inputs：authorized region boundary asset/ref、`placeIds[]`、route/segment order 和 Place `geo`。`schematic` 不允许目的地特判。projection、normalization、route curve、确定性默认 label placement 与 Daily bounds 由当前 map generator 生成；首版不承诺完整 collision solver。Generated layout 可作为 build artifact 缓存，但不能成为第二份手工旅行事实。

## 9. Pre-trip Items and Issues

### 9.1 Pre-trip Item

```ts
type PreTripItem = {
  type: "packing" | "reservation" | "document" | "reminder" | "other";
  title: string;
  note?: string;
  relatedRefs?: StableId[];
};
```

这是静态规划内容，不是用户新增 Todo。Todo completion/add/delete 属 Runtime State。现有 packing IDs 可迁移为 `PreTripItemId`；当前未被 UI 消费不等于可以静默删除。

### 9.2 Trip Issue

```ts
type TripIssue = {
  severity: "info" | "warning" | "error";
  status: "open" | "resolved" | "accepted-for-preview";
  title: string;
  detail?: string;
  relatedRefs: StableId[];
};
```

Issue 用 typed `relatedRefs` 指向事实源；不得在 `issuesAndUncertainties` 中复制完整航班、票务或租车事实。Issue 本身是 Trip authoring metadata，是否渲染由 Config/Core 能力决定。

## 10. Money and Private Booking Values

```ts
type Money = {
  currency: CurrencyCode;
  amountMinor: MinorAmount;
};
```

- 当前旅行的真实价格、PNR、confirmation、联系人、地址、私人文档路径均 `[PRIVATE VALUE]`。
- Demo 可使用虚构值，但不得从真实 Trip Package 脱敏后猜测发布。
- 公开 Schema 只描述类型与约束，不包含真实 examples。
- Ledger bills 不属于 Travel Data，即使也使用 Money type。

## 11. Reference Integrity Contract

Build/validation 必须失败的情况：

1. 任一 ID 不符合该 class 的 prefix/pattern。
2. 任一 object key 重复，或 ID 被修改后仍有旧引用。
3. `placeId`、`stayId`、`flightId`、`ticketIds`、`transportId`、`rentalId`、`restaurantId`、map/day refs 无法解析。
4. 同一实体被不允许地重复定义于两类 entity map。
5. Flight endpoint 缺 date/time/timeZone 或引用非 airport-compatible Place。
6. Stay/Rental event 的 timeZone 缺失，且 normalize step 无合法来源。
7. Day `sequence` 重复、Day ID 重复、Item ID 在 trip 内重复。
8. `entity-event` 无法从 item 的 typed reference 唯一解析。
9. custom map 的 `visibleRouteSegmentIds`、place feature 或 transport pin 引用不存在。
10. Core-facing relation仍依赖 `matchTerms`、substring、schedule index、day array index、SVG child index 或 display name。

Warnings 而非 hard failure：可选 geo 缺失导致 schematic map 无法包含某地点；可选 provider query 缺失导致外部导航 unavailable。若配置启用相关模块，则 warning 可提升为 error。

## 12. Derived Views

下列内容应由 normalize/build step 产生给 Renderer 的只读 view，而不是回写 Trip Package：

- Hero dates、day count、country/city summary、route summary；
- Flight Group route、stops、跨日标记、duration；
- Day weekday、location summary、cost tags；
- Ticket pending count 与 completed summary（结合 Runtime State）；
- Stay nights；
- Map overview/daily visibility；
- navigation actions；
- display currency/amount、localized dates/times。

Golden fixture 可以保存 `text`/`title` overrides 以逐字保持页面，但这些 overrides 不改变上述权威关系。

## 13. Public / Private Boundary

### `[PUBLIC-SAFE STRUCTURE]`

- 本文、当前JSON Schema、枚举、ID prefix、reference constraints；
- generic validator、normalizer、renderer；
- 完全虚构的 demo data 与授权公开 assets；
- schematic mode 的 generic inputs/output rules。

### `[PRIVATE VALUE]`

- 真实 `trip.id`、日期、人数、路线和 day schedule；
- 真实机场/住宿/餐厅/景点组合；
- 地址、navigation queries、订单号、票据、价格、联系人；
- 任何私人 Golden Trip 的 custom artwork/coordinates/routes（按 Golden Contract 作为 private Trip asset 管理）；
- 任何由真实材料推导、足以还原私人旅行的 metadata。

Private values 必须从 public build allowlist 之外输入；`.gitignore` 不是发布边界。

## 14. Remaining Product Decisions

这些决定不阻塞标准首版生成；需要扩展可见行为时另行确认：

1. **旧数据中只存在于规划列表、未进入交互Ticket UI的记录**：迁移时保留为Ticket entity，并只在有明确Day Item关系时挂`ticketIds`；本地票据与外部购买入口遵守Golden Behavior。
2. **Flight Group**：本合同建议保留轻量 authored group，因为当前有 group-only bookingStatus、fare 与 notes；若未来删除，必须先决定这些事实的新权威归属。
3. **复合地图点**：建议以一个概念anchor `placeId`配合`interactionPlaceIds[]`表达“城市锚点 + 酒店/车站/还车点”等复合目的地；每个点的primary interaction需在迁移fixture中逐一确认。
4. **未被当前 UI 消费的 preTrip packing 数据**：建议保留为可选静态 Trip Data，不能在没有产品决定时当作 dead data 删除。

## 15. Current implementation boundary

- `schemas/travel-data.schema.json`定义当前可执行子集；本文件可以描述比首版Renderer更完整的canonical方向，冲突时Schema优先。
- 单次Trip生成可以修改 `trip-config.json`、编译后的 `travel-data.json`、该Trip获授权的assets和reports，但不得修改Schema、normalizer、validator、renderer或map generator。
- Config负责module enablement；七个值来自第一轮确认。
- Runtime persistence与静态Trip Data分离，默认local，D1为显式opt-in。
- 任何数据架构工作不得改变Frozen UI、Behavior、Ledger Algorithm或Map Style。
