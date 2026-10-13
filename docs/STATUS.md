# OpenInNewTab 交接

## 当前主线

维护已上架的 Manifest V3 扩展与社区规则集。仓库记录 `2.2.0` 已通过 Chrome Web Store 审核，版本号以 `manifest.json` 为准。

## 接手入口

- [README](../README.md)：功能、权限、开发与验证命令。
- [发布清单](release-checklist.md)：干净 Profile 与正式 Chrome 验收步骤。
- [商店提交资料](web-store-submission.md)：商店状态、权限与提交文案。
- [2.2.0 发布说明](release-notes-2.2.0.md)：规则导出功能。
- [隐私说明](../PRIVACY.md)：权限和数据处理。
- 已加载测试扩展的位置与本地部署约定见本地 `AGENTS.md`。

## STATUS-001：建立集中交接入口

- 日期：2026-10-13。
- 仓库：`huaxianyan/OpenInNewTab`，分支 `main`，整理前基线 `953ad5a`。
- 当前状态：基线提交和 README 记录 `2.2.0` 已审核上线。本轮没有重新查询商店或安装商店版本。
- 关键边界：按网站申请可选权限，用户规则是结构化数据。链接保留真实 `href`，兼容浏览器原生导航。
- 文件入口：规则行为在 `rules.js`，可选规则集在 `rule-sets/`。测试部署与发布包共用 `scripts/extension-files.json`，规则索引由既有脚本生成。
- 本轮完成：建立交接文档，补 README 链接，将 README 的实际测试目录改为通用指引，具体位置保留在本地约定。
- 验证边界：未运行 JavaScript 检查、规则测试、浏览器验收或打包，没有同步测试部署目录、更新安装或提交商店。
- CI 与发布：本轮未推标签或修改规则文件。文档推送后的工作流结果未查询。
- 下一步：按故障范围选择既有模块或 DOM 验证入口。发布前按清单走正式 Chrome 验收，保护原扩展 ID 对应的数据。
