# Golden Ledger Specification

基线日期：2026-09-10  
事实来源：Golden Version `ledger.js`、当前local-first runtime storage与可选D1 adapter。

## 0. Contract Boundary

- **[FROZEN BEHAVIOR]**：成熟 Ledger用户行为。
- **[FROZEN ALGORITHM]**：相同有效输入必须产生完全相同的 cents结果、成员初字和 settlement结果。
- **[CURRENT IMPLEMENTATION]**：当前存储/文件组织或容错路径，允许未来经批准替换，但必须做回归。
- **[CONFIRMED ISSUE] / [POTENTIAL BUG] / [UNVERIFIED]**：不冻结为正确产品规则，详见 `known-issues.md`。

重构不得以浮点金额重新实现 cents算法，也不得用普通 greedy settlement替代当前最少转账搜索。

## 1. Data Model

### 1.1 Snapshot

**[CURRENT IMPLEMENTATION]** normalized snapshot：

```text
version: 1
settings:
  baseCurrency: currency code
  commonCurrencies: currency code[]
  lastCurrency: currency code
travelers: Traveler[]
bills: Bill[]
updatedAt: ISO timestamp
```

Travel Todo/Ticket虽与同一 API snapshot并存，但不进入 Ledger `normalizeData()` 结果。

### 1.2 Traveler

```text
id: string
name: trimmed string, max 30 characters on create/edit/load
initial: derived display character
color: #RRGGBB uppercase
```

### 1.3 Bill

```text
id: string
originalAmountCents: positive safe integer
baseAmountCents: positive safe integer
currency: supported uppercase currency code
category: 餐饮 | 交通 | 住宿 | 门票 | 购物 | 其他
note: trimmed string, max 160 characters
orderedAt: datetime-local string or empty string
payerId: existing Traveler ID
participantIds: unique existing Traveler ID[], at least one
createdAt: ISO timestamp
updatedAt: ISO timestamp
```

`originalAmountCents` 表达 bill currency金额；`baseAmountCents` 是统计与结算所用金额。二者均为整数 cents。

## 2. Traveler

### 2.1 Create

**[FROZEN BEHAVIOR]**

- 姓名先 trim；空姓名不创建、focus姓名字段、显示 notice。
- 与现有 active traveler重复则不创建。
- name保存最多前30个字符；initial由保存前输入按规则计算。
- color为合法六位hex时转 uppercase保存，否则使用 `nextAvatarColor()`。
- 新 ID通过 `makeId("person")` 产生。
- 新成员加入时先捕获未提交 bill draft，并把新ID加入 draft participants。
- 保存成功后 dialog保持 members open并显示成功 notice；保存失败不提交本地 traveler。

### 2.2 Rename / Color Edit

**[FROZEN BEHAVIOR]**

- Members dialog的“编辑”切换为内联 edit form并focus姓名。
- 空姓名拒绝；重复姓名拒绝。
- 成功时 name截到30字符、重新计算initial；合法color才覆盖原color。
- Traveler ID保持不变，因此现有 bill引用继续有效。
- 保存成功后结束 edit state；失败保留上一个已保存状态。

### 2.3 Duplicate Name

**[FROZEN ALGORITHM]**

```text
candidate = trim(name).toLocaleLowerCase()
duplicate = any traveler other than ignoredId
            whose trim(traveler.name).toLocaleLowerCase() === candidate
```

- 比较忽略首尾空白和大小写。
- 不做 Unicode normalization、内部空白折叠或同音/别名判断。
- Create notice与Rename notice文案不同，但均阻止 mutation。
- Load normalization不会主动合并历史同名 traveler；重复检查只发生在 create/edit操作。

### 2.4 Delete

**[FROZEN BEHAVIOR]**

- 若 traveler是任一 bill的 payer或出现在participantIds中，立即阻止删除、显示 notice；不会显示 confirm、不会发送 mutation。
- 未被引用时调用浏览器 `confirm("删除同行人…？")`；取消则无变化。
- 确认后从未提交 bill draft的participants移除该ID；若其为draft payer则清空payer。
- 保存成功后从 travelers移除；members dialog保持打开。

### 2.5 ID Generation

**[CURRENT IMPLEMENTATION]**，唯一性语义为 **[FROZEN BEHAVIOR]**。

- 首选 `${prefix}-${crypto.randomUUID()}`。
- 无 randomUUID时退回 `${prefix}-${Date.now()}-${8位base36随机}`。
- normalize load时，空ID或重复ID会重新生成 `person-*`。

### 2.6 Avatar Initial

**[FROZEN ALGORITHM]**

1. `Array.from(trim(name))` 得到Unicode字符序列；空序列返回 `?`。
2. 查找第一个 Unicode Han字符。
3. 若第一个Han为 `小`、`阿` 或 `老`，查找其后的第一个Han；存在则返回该字符。
4. 否则返回第一个Han。
5. 若没有Han，返回遇到的第一个 ASCII Latin `[A-Za-z]` 的uppercase。
6. 若没有Han或Latin，返回第一个字符的uppercase结果。

示例：`小明 → 明`、`阿华 → 华`、`老张 → 张`、`王小明 → 王`、`alice → A`、`123b → B`。

### 2.7 Avatar Color

**[FROZEN ALGORITHM]** palette顺序：

```text
#D96C42, #217D91, #5C8E62, #8B6AA8, #C58B32,
#4F72A2, #B85F76, #4E8F86, #9A6B4F, #68798E
```

`nextAvatarColor(travelers)`：

1. 把active travelers colors转uppercase放入Set。
2. 返回palette中第一个尚未使用的颜色。
3. 若全部已用，返回 `palette[travelers.length % 10]`。

Load normalization对合法hex uppercase；缺失/非法时按 traveler index循环 palette。颜色避免重复只适用于新增建议色，不会改写用户主动选出的重复颜色。

## 3. Bill

### 3.1 Create

**[FROZEN BEHAVIOR]**

- 没有 travelers时不渲染 bill form，只显示 onboarding。
- 新 bill默认：currency=`lastCurrency`；category=`餐饮`；participants=所有当前 travelers；payer为空。
- 表单必须通过 currency、original amount、foreign base amount、category、payer、至少一位participant校验。
- participantIds去重并过滤不存在的 traveler。
- 成功创建 `bill-*` ID、createdAt/updatedAt为同一当前ISO时间；append到bills。
- 新建bill时把 `settings.lastCurrency`设为本次currency。
- 保存成功后清除bill draft和edit state；失败不提交 ledgerData。

### 3.2 Edit

**[FROZEN BEHAVIOR]**

- 点击编辑时捕获当前new-bill draft，切换Entry tab、重渲染为edit form，平滑滚动到entry card并focus amount。
- edit form以原 bill currency、amounts、category、note、orderedAt、payer、participants初始化。
- 保存时保留 ID与createdAt，只覆盖字段与updatedAt。
- Edit不会更新 `lastCurrency`。
- 若另一bill已在完整编辑，拒绝切换并提示先保存或取消。
- 取消编辑只清除editingBillId并重渲染；不保存修改。

### 3.3 Delete

**[FROZEN BEHAVIOR]**

- 删除前调用 `window.confirm("删除这笔账单？")`。
- 取消无变化。
- 确认并保存成功后移除该ID，重新计算list/stats/settlement。
- 若该bill的inline note editor打开，先清除note edit state。

### 3.4 Date / Ordering

**[FROZEN BEHAVIOR]**

- `orderedAt`可空，来自 `datetime-local`，当前不附加独立timezone。
- Bill list排序key=`orderedAt || createdAt`，按字符串 descending。
- 显示时有效日期用 `Intl.DateTimeFormat("zh-CN", month/day/hour/minute, 24h)`；无法解析则把 `T` 替换为空格。
- Stats计算遍历 `ledgerData.bills` 当前数组顺序，但加法结果与顺序无关；related bill展示沿billIds收集顺序。

### 3.5 Category

**[FROZEN BEHAVIOR]**

- 有效值固定为：餐饮、交通、住宿、门票、购物、其他。
- Form必须选中有效分类；load时非法/未知分类归为“其他”。

### 3.6 Note 与 Inline Note Edit

**[FROZEN BEHAVIOR]**

- Full form note可空、trim、最多160字符。
- Inline editor打开时focus并select；相同bill已完整编辑则转到full note字段。
- 点击其他区域/action时先flush；切换到另一note前先保存当前note。
- note未变化时直接关闭editor，不发送mutation。
- 保存期间form标记saving且controls disabled。
- 成功后同步full form note（若存在）、恢复trigger并显示“已更新/已清空”。
- 失败后editor保持、controls重新启用、显示错误notice；后续依赖action被阻止。
- Escape或取消按钮放弃未保存值。

### 3.7 Payer / Participants

**[FROZEN BEHAVIOR]**

- Payer为单选且必须引用active traveler；payer不必属于participants。
- Participants为多选、去重、至少一人；账单允许单人参与。
- “全选”按钮：若存在任何未选成员则全选；若全部已选则全不选。
- Split summary：无人时提示至少一人；金额无效时仅提示人数/平分；有效时显示 `floor(baseAmountCents / participantCount)` 的“每人约”金额，不展示remainder差异。

## 4. Amount Storage and Validation

### 4.1 Input Grammar

**[FROZEN ALGORITHM]** `toCents(value)`：

1. 转字符串、trim、删除所有逗号。
2. 必须匹配 `^(?:\d+|\d*\.\d{1,2})$`。
3. 整数部分乘100；小数右补零至2位后相加。
4. 结果必须是 JavaScript safe integer，否则返回invalid。

由此：

- `100`、`100.0`、`100.00`、`.5`、`1,000.25`有效。
- 空、单独`.`、负数、正号、科学记数、三个以上小数、非数字无效。
- Form另要求 cents `> 0`；`0`、`0.00`拒绝。

### 4.2 Integer Cents Invariant

**[FROZEN ALGORITHM]**

- `originalAmountCents` 与 `baseAmountCents`均为正safe integer。
- Equal split、paid、owed、net、total、settlement全程使用integer cents。
- 仅显示/输入边界使用除100与两位小数格式化。
- 未来实现不得在算法中保存或累加浮点金额。

### 4.3 Base / Foreign Amount

**[FROZEN ALGORITHM]**

- Bill currency等于baseCurrency：`baseAmountCents = originalAmountCents`，converted field隐藏并清空。
- Bill currency不同：必须手动输入正的converted base amount；Core不计算汇率。
- `originalAmountCents/currency`保留原币事实；stats/settlement只使用`baseAmountCents`。

## 5. Equal Split

**[FROZEN ALGORITHM]** 精确定义：

```text
validParticipantIds = bill.participantIds 中仍存在的 traveler，保持数组顺序
n = validParticipantIds.length
baseShare = floor(baseAmountCents / n)
remainder = baseAmountCents - baseShare * n

依次遍历 validParticipantIds：
  amount = baseShare + (remainder > 0 ? 1 : 0)
  若分配了1 cent，remainder -= 1
```

- 余数按 `participantIds` 数组顺序从前到后分配，每人最多多1 cent。
- Map插入顺序保持participants顺序。
- 无有效participants返回空Map；正常form不允许创建该状态，但load normalization可能过滤非法记录。

例：`10000 / [B,C,D]` → `B=3334, C=3333, D=3333`。  
例：`10001 / [A,B,C]` → `A=3334, B=3334, C=3333`。

## 6. Paid / Owed / Net Balance

**[FROZEN ALGORITHM]** 对每个 traveler：

```text
paidCents = Σ bill.baseAmountCents where bill.payerId == traveler.id
owedCents = Σ billShares(bill)[traveler.id]
netCents  = paidCents - owedCents
```

- `netCents > 0`：creditor，UI“应收”。
- `netCents < 0`：debtor，UI“应付”。
- `netCents = 0`：neutral，UI“已结清”。
- `totalCents = Σ all bill.baseAmountCents`。
- `billIds`包含该成员付款或参与分摊的bill，每个ID最多一次。

## 7. Settlement / Minimum Transfer

### 7.1 Input Sets and Sorting

**[FROZEN ALGORITHM]**

- Debtor：`netCents < 0`，amount=`-netCents`。
- Creditor：`netCents > 0`，amount=`netCents`。
- Debtors先按amount descending，再按traveler ID `localeCompare` ascending。
- Creditors使用相同排序。
- Neutral不进入搜索。

### 7.2 Recursive Search

**[FROZEN ALGORITHM]**

1. 在debtAmounts中找第一个 `>0` 的 debtor；不存在则返回空transfer list。
2. Memo key为 `debtAmounts.join(",") + "|" + creditAmounts.join(",")`。
3. Lower bound为当前正debt数量与正credit数量的较大值。
4. 按creditor数组顺序尝试；跳过 `<=0`。
5. 在同一递归层，余额相同的creditor amount只尝试第一个（`triedCreditAmounts`剪枝）。
6. 本次transfer=`min(firstDebtorDebt, selectedCredit)`；分别扣减后递归。
7. Candidate为当前transfer加递归结果。
8. 仅当candidate transfer数量严格更少时替换best；相同长度保留先遇到的candidate。
9. 若best长度达到lower bound，立即停止该层后续creditor尝试。
10. Memoize best或空数组。

### 7.3 Determinism and Tie-breaking

**[FROZEN ALGORITHM]**

- 第一个未清debtor由已排序数组决定。
- Credit尝试顺序由creditor排序决定。
- Equal outstanding amount在每层只尝试第一个，因此ID升序决定代表者。
- Equal-length方案不会覆盖先遇到方案。
- 最终输出保持递归生成顺序，不做二次排序。
- Transfer映射回 `{fromId,toId,amountCents}`。

### 7.4 Required Result

算法目标是当前搜索空间内的最少transfer数量，而非简单最大额greedy。未来可以重构实现，但对同一规范化输入，transfer数量、顺序、from/to与amount cents必须完全一致。

### 7.5 Complexity

**[CURRENT IMPLEMENTATION]** 使用memoization和同额credit剪枝，但成员多时仍可能出现组合搜索开销。性能优化不得改变输出tie-break。

## 8. Multi-Currency

### 8.1 Defaults and Available Currencies

**[CURRENT IMPLEMENTATION]** defaults：

```text
baseCurrency = CNY
commonCurrencies = [EUR, CHF, HKD]
lastCurrency = CNY
```

- Available bill currencies为base + common +当前extra bill currency的去重集合。
- Settings normalization只保留catalog已知code；common中移除base并去重。
- last必须属于base/common，否则回退base。

### 8.2 Base Currency

**[FROZEN BEHAVIOR]**

- 无bill时允许选择新base；选择后从common移除该code并将last设为新base。
- 有至少一笔bill时settings按钮disabled；action层也再次拒绝并提示。
- 锁定意图是避免历史converted base cents失真。

### 8.3 Common Currencies

**[FROZEN BEHAVIOR]**

- Base不能作为common选择。
- 搜索支持code、中文名、英文名、symbol与aliases，normalize NFKD、小写并删除空白/点/下划线/斜杠/连字符；最多展示24项。
- 选择未加入code则append；选择已加入code则remove。
- 从common移除当前last时，last回退base。

### 8.4 Last Currency

**[FROZEN BEHAVIOR]**

- 仅在创建新bill时设为本次currency。
- 新bill form优先使用draft currency，否则使用last。
- Edit bill不更新last。

### 8.5 Settings Persistence

- **[CURRENT IMPLEMENTATION]** 默认local mode按Trip ID在当前浏览器保存settings、travelers与bills；刷新同一浏览器后恢复。
- **[CONFIRMED ISSUE]** 显式D1 mode仍不把settings同步到云端；settings保持当前浏览器本地，不能承诺跨设备一致。这不属于`[FROZEN ALGORITHM]`。

## 9. Form Draft and UI State

**[FROZEN BEHAVIOR]**

- New-bill draft包含currency、两个amount输入、category、note、orderedAt、payerId、participantIds。
- 打开dialog、切tab、进入member编辑等会capture draft；重新渲染后恢复。
- 新增成员成功时加入draft participants；删除成员时从draft清除。
- 进入完整bill edit前保存new-bill draft；取消/完成edit后可回到draft。
- Draft、editing IDs、open dialog、currency query、notice只存在内存，不跨reload。

## 10. Mutation Queue and Failure

### 10.1 Queue

**[FROZEN BEHAVIOR]**

```text
queued = previousQueue.then(operation, operation)
mutationQueue = queued.catch(() => {})
```

- 同一页面内Ledger mutations按触发顺序串行。
- 前一mutation失败不会永久阻断后续mutation。
- 普通 `mutateData` 在轮到执行时clone最新一次成功的`ledgerData`。

### 10.2 Commit Semantics

**[FROZEN BEHAVIOR]**

- 普通Ledger CRUD/settings：clone → mutate next → adapter.save → success后normalize/replace state/render/event。
- Save失败：记录console，显示“保存失败…”notice，保留上一次成功的ledgerData，不发changed event。
- 成功：发 bubbling `travel-ledger:changed`，包含tripId、reason与snapshot clone。
- Inline note使用同一queue但有专门saving/disabled/failure恢复逻辑。

## 11. Persistence Adapters

### 11.0 Selection contract

- **[FROZEN BEHAVIOR]** `persistence`缺失、非法或`mode="local"`时使用local adapter，不访问`/api/trip`，不要求Cloudflare或D1。
- **[FROZEN BEHAVIOR]** localStorage按canonical Trip ID隔离；不可用时退回本标签页内存，Ledger仍可操作。
- **[FROZEN BEHAVIOR]** 只有`mode="d1"`且`ledger`列入`sharedCollections`时才启用D1 adapter。
- D1必须由部署者在自己的Cloudflare账户中显式创建/绑定；database/account/token/binding identity不得进入Trip Config或仓库。

### 11.1 Optional D1 collections

**[CURRENT IMPLEMENTATION]**

- Ledger D1 adapter只同步`bills`、`travelers`；settings保留浏览器本地。
- 可选Cloudflare API还可存`todos`、`tickets`，但只有列入`sharedCollections`时才由Travel module同步。
- D1表主键均为 `(trip_id,id)`；bill另有 `(trip_id,created_at)` index。
- 没有settings table、snapshot revision、mutation ID、user或conflict metadata。

### 11.2 Diff and Save Order

**[CURRENT IMPLEMENTATION]**

- Adapter持有上次server snapshot `previous`。
- 对bills/travelers分别构造before/after ID maps。
- before有、after无 → delete；after与before JSON不等 → upsert完整record。
- 单次POST发送changes数组；server使用D1 batch执行后返回完整snapshot。
- 远端snapshot对`bills/travelers`是authoritative；runtime adapter在返回前合并当前浏览器的local settings，避免把D1的`settings:null`当成共享设置。

### 11.3 Normalize on Load

**[CURRENT IMPLEMENTATION]**

- 空/非object snapshot退回default。
- Traveler空name丢弃；空/重复ID重建；非法color按index palette。
- Bill original/base amount非正safe integer、currency未知、payer不存在或participants为空时整笔丢弃。
- Participant IDs去重并过滤不存在成员；category非法归“其他”；note trim/160。
- 这些是当前防御性容错，不应代替未来schema validation。

### 11.4 D1 load failure

- **[FROZEN BEHAVIOR]** 显式D1 load异常时显示shared-state notice并保留安全的本地/默认normalized ledger，UI仍可操作；提示不得暗示用户必须绑定模板作者的数据库。
- **[POTENTIAL BUG]** 在尚未成功读取远端时继续mutation的覆盖/合并风险仍需失败注入验证。默认local mode不受此风险影响。

## 12. Concurrent Devices

### 12.1 Different Records

**[CURRENT IMPLEMENTATION]** 从代码推导：两个已加载同一snapshot的设备分别新增/修改不同bill ID时，各自diff只发送所改ID；server record-level upsert后返回完整snapshot，因此通常合并两条记录。

### 12.2 Same Record

**[CURRENT IMPLEMENTATION]** 从代码推导：两个设备修改同一bill时，后到达的完整payload覆盖先到达值；没有revision/ETag/field merge/conflict提示。持有旧snapshot的设备之后再次保存该record，可能覆盖对方修改。

- **[UNVERIFIED]** 以上两种并发尚未在真实D1双设备环境执行；以 regression cases 18/19 作为验证入口。
- 并发覆盖行为不是 `[FROZEN BEHAVIOR]`，未来是否加入conflict control需用户批准。

## 13. Dialog and Keyboard

**[FROZEN BEHAVIOR]**

- Members、Settings、Currency dialogs同时最多一个open。
- Open默认focus首个非color input/button；currency focus search。
- 点击dialog backdrop、close或native cancel关闭；currency close语义为返回Settings。
- Ledger tabs支持Left/Right切换并focus新tab。
- Inline note Escape取消。

**[CURRENT IMPLEMENTATION]** Ledger dialogs依赖native modal focus containment，无自定义trap或opener restore。

**[UNVERIFIED]** 关闭后的focus return、fallback `open`路径和全浏览器keyboard行为。

## 14. Public API

**[CURRENT IMPLEMENTATION]** `window.TravelLedger`公开的Ledger入口仍包括：

- `init`
- `setActiveTab`
- `createLocalStorageAdapter`
- `createD1Adapter`（只供显式D1 mode使用）
- `getPersistenceMode`
- `getSnapshot`（deep clone或null）

算法函数当前未公开。未来建立算法测试时可以抽出纯函数或使用受控test harness，但抽取前后结果必须满足本规范。
