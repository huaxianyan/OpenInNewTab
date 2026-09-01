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

## 尚待人工确认

其余首次授权、拒绝授权、可视化编辑、排除项、权限回收、NGA、PSNINE 和浏览器原生操作，继续按照 [`release-checklist.md`](release-checklist.md) 验收。

Cent Browser 用于补充 Chromium 兼容性验证。提交 Chrome Web Store 前仍需在当前稳定版 Google Chrome 中完成最终人工验收。
