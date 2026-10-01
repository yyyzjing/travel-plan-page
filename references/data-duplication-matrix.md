# Data Duplication Matrix

状态：Advanced/legacy One Fact 检查参考；普通生成以根目录 `SKILL.md` 与 `validate-lite` 为准。

## 1. Authoritative ownership

| Fact | Authoritative source | Derived / presentation consumers | Forbidden second authority |
|---|---|---|---|
| Module enablement | `trip-data.json > config.modules` | section/navigation/init visibility | 删除HTML、JS条件特判 |
| Persistence mode | `trip-data.json > config.persistence` | runtime storage adapter | Ledger/Todo/Ticket各自猜测后端 |
| Trip identity | canonical Trip ID | runtime storage namespace、API path | HTML第二个Trip ID |
| Trip dates/day count | Days/events | Hero与summary | 人工维护冲突摘要 |
| Flight facts | Flight entity | cards、timeline references | schedule文字中的独立事实 |
| Stay facts | Stay + Place | daily display/navigation | HTML品牌/地址常量 |
| Place name/address/geo/query | Place entity | itinerary、map、overlay | map/navigation平行Place目录 |
| Ticket identity/document | Ticket entity | Day Item、Ticket renderer | substring匹配、重复票据记录 |
| Ticket completion | Runtime state by Ticket ID | Ticket UI/day summary | 静态Trip Data boolean |
| Transport leg | Transport entity | Day Item、map route/pin/popup | schedule index或复制文字 |
| Rental facts | Rental + Place | driving card/countdown | HTML provider或固定时区 |
| Day item order | `days[].items[]` sequence | Timeline | array position充当跨模块ID |
| Map country | canonical destination countries | generated country packages/tabs | 从display text猜国家 |
| Map place | canonical Place geo | projected x/y、labels、hit targets | 第二套手工地点identity |
| Map route | Day/Transport/Place order | generated SVG paths | 手工path充当路线事实 |
| Daily map range | selected Day place set | generated bounds/layout | 复用整国画布造成城市点聚集 |
| Todo items/completion | Runtime state | Todo UI | 静态规划内容混入runtime list |
| Ledger travelers/bills/settings | Runtime state | Ledger views/stats | 静态Trip fixture |
| Missing/ambiguous facts | private Source Facts issues | preview待补充状态/report | Agent猜测值 |

## 2. Current authoring rules

1. 先从仓库外`source-facts.json`生成canonical data。
2. 所有entity和cross-module relation使用stable typed IDs。
3. Presentation text可以重复显示，但不能控制选择、匹配或identity。
4. Map Package由generator派生，不人工同步坐标、route或schedule indexes。
5. Runtime Todo、Ticket completion与Ledger不写入静态Demo或Trip Data。
6. Config/Data和所有引用必须通过validator。

## 3. Validation gate

以下情况必须失败，而不是要求Agent手工“记得同步”：

- 同一事实出现两个可编辑来源；
- 任一typed reference悬空、类型错误或重复；
- display text变化导致entity、Ticket、Place或Transport选择改变；
- schedule/day/SVG child位置被用作跨模块identity；
- Map Package与canonical Place/Day/Transport不一致；
- Runtime state进入公开Trip fixture；
- 私人Source Facts、原始文件路径或Cloudflare identity进入发布目录。

需要改变上述所有权时，作为独立框架维护任务处理；单次旅行生成不得修改Core来绕过检查。
