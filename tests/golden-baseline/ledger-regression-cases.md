# Golden Ledger Regression Cases

版本：Phase 0 / Round 2  
金额单位：除显示值外，所有 Expected均为integer cents。  
默认Traveler ID顺序：`A < B < C < D < E`；participantIds按题目书写顺序。

## Test Harness Rules

- 测试必须比较完整 `{paidCents, owedCents, netCents}` 和有序 transfers，而非只比较总额。
- 不得用浮点金额构造内部expected。
- 每个case至少执行两层：纯Ledger/fake repository，以及当前D1 adapter integration。Settings case必须明确区分两层。
- `[CODE-CONFIRMED]` 表示结果可从当前函数精确推出；`[UNVERIFIED-INTEGRATION]` 表示仍需真实浏览器/D1测试。
- 对相同金额的排序依赖Traveler ID `localeCompare`；测试ID不可随机，否则tie-break不可复现。

## CASE 01 — A支付100.00，ABCD参与

**Status:** `[CODE-CONFIRMED]`

**Given**

- Travelers：A、B、C、D。
- Bill：payer A，`baseAmountCents=10000`，participants `[A,B,C,D]`。

**When** 计算split、members和settlement。

**Expected**

| Member | Paid | Owed | Net |
|---|---:|---:|---:|
| A | 10000 | 2500 | +7500 |
| B | 0 | 2500 | -2500 |
| C | 0 | 2500 | -2500 |
| D | 0 | 2500 | -2500 |

有序 transfers：`B→A 2500`、`C→A 2500`、`D→A 2500`。

## CASE 02 — B支付100.00，BCD参与，验证余数

**Status:** `[CODE-CONFIRMED]`

**Given** Bill payer B，`10000` cents，participants `[B,C,D]`。

**When** equal split。

**Expected**

- `floor(10000/3)=3333`，remainder `1`。
- participantIds首位B承担 `3334`；C与D各 `3333`。

| Member | Paid | Owed | Net |
|---|---:|---:|---:|
| A | 0 | 0 | 0 |
| B | 10000 | 3334 | +6666 |
| C | 0 | 3333 | -3333 |
| D | 0 | 3333 | -3333 |

Transfers：`C→B 3333`、`D→B 3333`。

## CASE 03 — 100.01，ABC参与，验证cents remainder

**Status:** `[CODE-CONFIRMED]`

**Given** Bill payer A，`10001` cents，participants `[A,B,C]`。

**When** equal split。

**Expected**

- Base share `3333`，remainder `2`。
- A=`3334`，B=`3334`，C=`3333`。
- Net：A `+6667`，B `-3334`，C `-3333`。
- Transfers：`B→A 3334`、`C→A 3333`。

## CASE 04 — A/B多笔付款

**Status:** `[CODE-CONFIRMED]`

**Given**

- Bill 1：A支付 `12000`，participants `[A,B,C,D]`。
- Bill 2：B支付 `9000`，participants `[B,C,D]`。

**When** 计算累计balance。

**Expected**

| Member | Paid | Owed | Net |
|---|---:|---:|---:|
| A | 12000 | 3000 | +9000 |
| B | 9000 | 6000 | +3000 |
| C | 0 | 6000 | -6000 |
| D | 0 | 6000 | -6000 |

有序 transfers：`C→A 6000`、`D→A 3000`、`D→B 3000`。

## CASE 05 — 复杂debt，验证minimum transfer而非greedy

**Status:** `[CODE-CONFIRMED]`

**Given**

- Bill 1：B支付 `4000`，participant `[C]`。
- Bill 2：A支付 `3000`，participant `[D]`。
- Bill 3：A支付 `3000`，participant `[E]`。

形成：A `+6000`、B `+4000`、C `-4000`、D `-3000`、E `-3000`。

**When** settlement递归搜索。

**Expected**

- 初始最大额配对 `C→A` 会需要4笔，因此算法必须继续搜索。
- 最少结果为3笔，且按当前tie-break输出：
  1. `C→B 4000`
  2. `D→A 3000`
  3. `E→A 3000`

## CASE 06 — 单人账单

**Status:** `[CODE-CONFIRMED]`

**Given** A支付 `10000`，participants `[A]`。

**When** 计算。

**Expected** A paid=`10000`、owed=`10000`、net=`0`；total=`10000`；transfers为空。

## CASE 07 — 编辑bill amount

**Status:** `[CODE-CONFIRMED]`

**Given** 原bill：A支付 `9000`，participants `[A,B,C]`；ID=`bill-1`。

**When** amount编辑为 `12000` 并保存。

**Expected**

- bill ID与createdAt不变；updatedAt改变。
- original/base amount均为 `12000`（base currency bill）。
- A paid=`12000`、owed=`4000`、net=`+8000`；B/C各owed=`4000`、net=`-4000`。
- Transfers：`B→A 4000`、`C→A 4000`。

## CASE 08 — 编辑payer

**Status:** `[CODE-CONFIRMED]`

**Given** `10000` cents，participants `[A,B]`，原payer A。

**When** payer改为B。

**Expected**

- 修改前：A `+5000`、B `-5000`。
- 修改后：A `-5000`、B `+5000`。
- 修改后transfer：`A→B 5000`。

## CASE 09 — 编辑participants

**Status:** `[CODE-CONFIRMED]`

**Given** A支付 `10000`；原participants `[A,B]`。

**When** participants改为 `[A,B,C]`。

**Expected**

- 修改前shares A/B=`5000/5000`。
- 修改后shares A/B/C=`3334/3333/3333`。
- 修改后net：A `+6666`、B `-3333`、C `-3333`。
- Transfers：`B→A 3333`、`C→A 3333`。

## CASE 10 — 删除bill

**Status:** `[CODE-CONFIRMED]`

**Given** 只有CASE 01的一笔bill。

**When** 用户确认删除且save成功。

**Expected** bills为空；total=`0`；A/B/C/D paid/owed/net均为0；transfers为空；travelers保留。

**And** 用户取消confirm时任何state、updatedAt、API均不变。

## CASE 11 — 删除被引用traveler

**Status:** `[CODE-CONFIRMED]`

**Given** A是payer或participant，且至少一笔bill引用A。

**When** 点击删除A。

**Expected**

- 不出现删除confirm。
- 不调用adapter.save。
- A与bill保持不变。
- Live notice提示需先处理相关账单。

## CASE 12 — Duplicate traveler name

**Status:** `[CODE-CONFIRMED]`

**Given** 已有 traveler name=`Alice`。

**When** 新增 ` alice ` 或把另一成员改名为 `ALICE`。

**Expected** trim + locale lowercase后相等，操作被拒绝、focus姓名、显示duplicate notice、不调用save。

**And** `A lice`不因内部空格而判重；Unicode normalization不属于当前duplicate算法。

## CASE 13 — Foreign currency

**Status:** `[CODE-CONFIRMED]`

**Given** baseCurrency=`CNY`；创建EUR bill：original=`100.00`，手动converted base=`780.50`，payer A，participants `[A,B]`。

**When** 保存和计算。

**Expected**

- `currency="EUR"`
- `originalAmountCents=10000`
- `baseAmountCents=78050`
- split基于base：A=`39025`、B=`39025`
- A paid=`78050`、owed=`39025`、net=`+39025`；B net=`-39025`
- 列表显示原币金额，并额外显示折合CNY；settlement使用CNY `39025`。
- 不进行自动汇率计算。

## CASE 14 — 修改baseCurrency：无bill / 已有bill

**Status:** `[CODE-CONFIRMED]`，含已知integration issue。

### 14A 无bill，settings-capable fake repository

**Given** defaults且bills为空。

**When** base选择EUR。

**Expected** base=`EUR`；EUR从common移除；last=`EUR`；显示成功notice。

### 14B 已有bill

**Given** 至少一笔bill。

**When** 尝试修改base。

**Expected** settings button disabled；即使直接触发action也拒绝、提示已有账单，settings不变、无save。

### 14C 当前D1 adapter

**Given** 无bill且使用Golden D1 adapter。

**When** base选择EUR。

**Expected current issue** POST不含settings change；server返回`settings:null`；normalize后回到defaults。此结果用于记录当前bug，不得作为未来正确产品预期。

## CASE 15 — commonCurrencies / lastCurrency

**Status:** `[CODE-CONFIRMED]`，含已知integration issue。

**Given** settings-capable fake repository，base CNY、common `[EUR,CHF,HKD]`、last CNY。

**When / Expected**

- 添加USD → common append USD，顺序 `[EUR,CHF,HKD,USD]`。
- 再选USD → remove USD。
- 创建EUR bill → last=`EUR`。
- 移除当前last EUR → common不含EUR、last回退CNY。
- Edit一个CHF bill → last不改变。
- Base currency不能加入common。

**Current D1 integration Expected issue** 每次settings-only mutation响应`settings:null`并归一化defaults；new bill虽设置last，server响应后last也回退default。

## CASE 16 — 刷新页面与持久化

**Status:** `[CODE-CONFIRMED]` for code path；真实部署仍需integration run。

**Given** 成功保存travelers、bills，并尝试修改base/common/last。

**When** reload并从当前D1 adapter加载。

**Expected**

| Field | 当前Golden持久化 |
|---|---|
| travelers | 是，逐record D1 |
| bills | 是，逐record D1 |
| baseCurrency | 否，回到default/normalization结果 |
| commonCurrencies | 否，回到defaults |
| lastCurrency | 否，回到base/default |

Todo/Ticket由同一API的其他collection持久，但不属于Ledger snapshot normalization。

## CASE 17 — 同一浏览器快速连续mutation

**Status:** `[CODE-CONFIRMED]`

**Given** 连续触发M1、M2、M3，adapter使用可控deferred promises。

**When** 三个mutation快速入队。

**Expected**

- save调用严格按M1→M2→M3，不并行。
- M2在M1成功后clone包含M1的最新ledgerData。
- 若M1失败，M2仍会执行，基于M1之前最后成功state。
- 每次成功各发一次changed event；失败不发且显示notice。

## CASE 18 — 两设备修改不同bill

**Status:** `[UNVERIFIED-INTEGRATION]`

**Given** Device 1与Device 2加载同一snapshot；D1新增/修改不同bill ID。

**When** 两端先后POST。

**Expected from current code** 每个client diff只包含自己变更的record；server record-level upsert合并不同ID，后响应snapshot应包含两端records。

**Verify** 网络顺序、D1 batch结果、两端本地snapshot是否只有发起mutation的一端立即看到合并结果；另一端需下一次save/reload才更新。

## CASE 19 — 两设备修改同一bill

**Status:** `[UNVERIFIED-INTEGRATION]`

**Given** 两设备加载同一 `bill-1`，分别改不同字段或金额。

**When** 两个完整payload先后upsert同一 `(trip_id,id)`。

**Expected from current code** 后到达写入覆盖先到达payload；无revision、ETag、field merge、冲突提示或自动重试。旧设备之后再次保存同record可再次覆盖新值。

此“last write wins”是当前实现记录，不是Frozen正确行为。

## Acceptance Summary

- Cases 01–13、17的算法/交互结果必须在重构前后完全一致。
- Cases 14–16需同时保留“产品逻辑合同”和“当前D1 settings bug”两层expected；修复bug前Golden integration应匹配当前记录，修复必须另获批准并更新baseline。
- Cases 18–19在真实D1验证前保持 `[UNVERIFIED-INTEGRATION]`，不得宣称已通过。
