# OpenInNewTab 2.0.0 验收记录

## 测试对象

- 发布包：`dist/OpenInNewTab-2.0.0.zip`
- SHA256：`A19EFE73F8F429C9959929FB4A141B7267432434C7565D9875D4B00EA670F092`
- 浏览器：Cent Browser 5.2.1168.83
- 环境：由 `scripts/start-clean-test.ps1` 创建的全新独立 Profile
- 日期：2026-09-01

## 已通过

- [x] 正式 ZIP 能在干净 Profile 中加载
- [x] Manifest V3 service worker、Popup 和设置页能启动
- [x] `rule-sets/v2ex.json` 能显示导入预览并完成导入
- [x] 导入后的 V2EX 主题链接规则能够正常工作

## 暂缓的人工项目

首次授权拒绝、可视化编辑、排除项、权限回收、NGA、PSNINE 和浏览器原生操作尚未逐项人工确认。维护者于 2026-09-01 决定接受这部分发布风险，继续提交 Chrome Web Store。这些项目不能视为已通过，后续仍可按照 [`release-checklist.md`](release-checklist.md) 回归。

Cent Browser 用于补充 Chromium 兼容性验证。当前发布决定不等待官方 Google Chrome 的完整人工验收。

## Chrome Web Store 状态

- 提交方式：维护者在原 Chrome Web Store 条目中手动提交
- 提交日期：2026-09-01
- 当前状态：审核中
- 提交文件：`OpenInNewTab-2.0.0.zip`
- SHA256：`A19EFE73F8F429C9959929FB4A141B7267432434C7565D9875D4B00EA670F092`

审核完成前冻结此发布包。同一版本不得重新生成或替换；后续运行代码改动使用新的版本号。
