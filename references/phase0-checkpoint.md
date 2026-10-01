# Phase 0 Checkpoint — Historical Record

状态：历史审计记录；旧B-Template执行方向已被`standard-generation-workflow.md`取代。

## Retained findings

Phase 0确认并保留了这些长期有效的成果：

- Golden UI、Behavior、Ledger Algorithm与Map Style拥有独立合同；
- HTML/CSS/JavaScript、Ledger、Pages Function与D1 migration职责已审计；
- 旧版存在Trip ID重复、文字/数组位置关联、固定时区、D1无认证和Ledger settings共享缺失等风险；
- 私人Golden fixture、真实Trip ID、路线、日期、坐标和assets不得进入Public Template；
- 公开Demo必须完全虚构或取得明确授权。

## Superseded Phase 0 decisions

以下曾是早期B-Template的临时方向，现已废止，不能再指导单次生成：

- 允许为每个Trip局部修改HTML/CSS/JavaScript；
- 缺少Config时手工删除模块；
- 人工放置地图坐标、手画route和daily layouts；
- 不实现projection、validator或标准Map Generator；
- 默认围绕Cloudflare D1 shared adapter运行。

现行方向是：

- 两轮确认；
- Config-driven modules；
- canonical data与stable references；
- 自动boundary projection、route和Daily bounds；
- Core integrity验证；
- local-first persistence；
- deployment与D1均为用户明确选择的后续任务。

## Privacy note

早期Phase 0审计曾包含私人仓库与Custom Map Fixture信息。那些值已从本公开目录移除；不得通过Git history、线上页面、截图或私人目录还原到Public Template。

## Current entry points

- `../SKILL.md`：Agent入口与强制边界；
- `standard-generation-workflow.md`：当前单次生成权威流程；
- `deployment-guide.md`：本地预览之后的可选发布与D1流程；
- `golden-contract.md`：Core、隐私、行为和算法总合同；
- `golden-map-spec.md`：当前标准地图生成与视觉合同。
