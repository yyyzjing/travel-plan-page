# Known Issues

原则：记录，不修复；Confirmed/Potential/Unverified均不得自动写入 Frozen正确行为。

## Summary

默认运行模式现为浏览器本地存储。以下D1问题只影响用户明确启用的shared mode，不影响普通本地预览或静态部署。

| 分类 | 数量 | ID |
|---|---:|---|
| Confirmed Issue | 3 | CI-01 ～ CI-03 |
| Potential Bug | 1 | PB-04 |
| Unverified Behavior | 8 | UV-01 ～ UV-08 |

## [CONFIRMED ISSUE]

### CI-01 — Ledger settings未进入D1共享链路

**受影响字段**

- `baseCurrency`
- `commonCurrencies`
- `lastCurrency`

**已确认事实**

- D1只保存`bills`、`travelers`；API snapshot不提供共享settings。
- 可选D1 migration无settings table/column。
- runtime D1 adapter使用独立local adapter保存settings，并把当前浏览器settings合并到远端snapshot。

**当前影响**

- D1模式下Settings不能跨设备共享。
- 默认local模式不受影响；Settings会随该Trip保存在当前浏览器。
- D1模式中的Settings仍按当前浏览器本地状态处理，不能将其描述为云端同步。

**分类决定**

这是可选D1 shared mode的当前限制，不是 `[FROZEN BEHAVIOR]` 或 `[FROZEN ALGORITHM]`。

### CI-02 — D1模式下Ticket mutation失败不回滚且无用户可见错误

**已确认事实**

- Checkbox change先修改`purchasedTickets` Set并更新所有ticket UI/day summary。
- 之后异步POST upsert/delete。
- Promise rejection仅 `.catch(console.error)`。

**当前影响**

- 保存失败后当前页面仍显示用户操作已成功。
- Reload后可能恢复服务端旧状态。
- 用户无法从页面知道失败或主动重试。

**分类决定**

Pending/Purchased交互意图被冻结；失败不rollback的结果不冻结为正确行为。本轮未修复。

### CI-03 — D1模式下Todo mutation失败不回滚且无用户可见错误

**已确认事实**

- 新增、完成/取消、删除均先修改本地数组并重绘。
- 之后异步POST。
- Promise rejection仅 `.catch(console.error)`。

**当前影响**

- 失败后UI与D1可能不一致。
- Reload后新增项可能消失、完成态可能反转、删除项可能重新出现。
- 页面没有失败notice或retry状态。

**分类决定**

Todo CRUD的用户意图被冻结；无rollback错误路径不冻结。本轮未修复。

## [POTENTIAL BUG]

### PB-04 — D1 shared state读取失败可能被呈现为空状态

- Travel shared API load失败时，todos和purchasedTickets被清空并继续渲染。
- 页面只写console，不显示共享状态读取失败。
- 用户可能把“读取失败”误判为“没有数据”；真实D1恢复后的合并体验未验证。

## [CURRENT IMPLEMENTATION] — 不冻结的脆弱路径

以下不是单独bug计数，但不得升级为未来产品合同：

- 旧Demo/兼容数据仍可能包含Ticket `scheduleMatchTerms`或Navigation文字匹配；新canonical Trip必须使用typed IDs，validator不得允许这些兼容路径成为新数据的identity。
- Todo ID使用timestamp + random suffix；稳定唯一语义保留，具体格式不冻结。
- Ledger settings defaults仍固定CNY/EUR/CHF/HKD；未来可由Config给初始值。
- Ledger多设备同record写入当前推导为last-write-wins。
- `local-preview-server.mjs`现在只提供静态GET/HEAD预览，不模拟`/api/trip`。可选D1的错误语义必须在用户明确启用后，通过Cloudflare本地开发环境或真实测试项目验证。

## [UNVERIFIED]

### UV-01 — Travel details键盘行为

原生`details/summary`在不同浏览器的Escape、方向键与`role=menu`组合尚未验证。

### UV-02 — 同view浏览器历史与scroll

`#ledger/#ledger-stats`或多个Travel anchors之间Back/Forward的精确scroll恢复尚未做浏览器矩阵测试。

### UV-03 — Countdown时间边界

精确等于target的毫秒、后台tab interval节流、系统时间跳变与设备休眠唤醒尚未验证。

### UV-04 — Google Maps网络/浏览器限制

iframe被阻止、Google不可达、popup policy、外链打开失败时的完整用户体验尚未验证。

### UV-05 — Fullscreen map dialog focus

Fullscreen的初始focus、Tab containment、Escape后的focus return和fallback-open路径尚未完整验证。

### UV-06 — Ledger dialog focus return

Native/fallback Ledger dialog关闭后的focus return目标与跨浏览器Tab containment尚未验证。

### UV-07 — D1真实失败注入

Ledger load/save failure、note failure、恢复网络后的重试和最终一致性尚未在真实Cloudflare D1环境完成。

### UV-08 — 两设备并发

不同record推导为record-level merge，同record推导为last-write-wins；尚未完成真实双设备D1测试。

## Resolved direction

- D1不再是默认依赖；有效Config的默认生成值为local mode。缺失/非法Config在页面端显示加载错误，不猜测模块选择，也不连接D1。
- Local mode按Trip ID保存Todo、Ticket、Ledger travelers/bills/settings，不请求`/api/trip`。
- D1只能由用户显式启用，并使用用户自己的Cloudflare database。
- module visibility由Config控制，单次Trip不修改Core。

## Deferred framework work

- D1模式下是否共享Ledger settings及采用何种server shape。
- 是否为D1模式的Todo/Ticket增加rollback、retry或冲突UI。
- 是否引入D1 revision/conflict control与认证。
