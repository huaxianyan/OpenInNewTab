# OpenInNewTab

按网站设置规则，让指定链接在新标签中打开。支持在页面上直接选择同类链接、排除不需要处理的链接，以及应对网站接管点击行为的保护模式。

## 功能

- 在当前页面可视化选择同类链接
- 通过蓝色和红色预览包含、排除范围
- 按网站申请权限，不在安装时访问所有网站
- 支持动态生成的链接和单页应用页面
- 兼容浏览器原生中键、右键和组合键操作
- 使用 Chrome 同步存储保存规则
- 在 Popup 中启停、切换模式、可视化编辑和删除当前网站规则
- 导出规则集，导入前预览并逐条选择

## 安装开发版本

1. 下载或克隆本仓库
2. 打开 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择仓库根目录

修改代码后，需要在扩展管理页面刷新扩展。已经打开的目标页面通常也需要刷新。

### 保留原测试版数据

如果 Chrome 之前从 `E:\dev\aboutblank` 加载扩展，继续使用该目录可以保留原解压扩展 ID 对应的规则数据。仓库是唯一源码，使用以下命令把当前测试版同步到旧加载目录：

```powershell
pwsh -File .\scripts\deploy-test.ps1
```

也可以指定其他已加载目录：

```powershell
pwsh -File .\scripts\deploy-test.ps1 -Target "D:\path\to\extension"
```

同步后在 `chrome://extensions/` 中刷新原扩展。不要直接在测试部署目录修改源码，下一次同步会覆盖运行文件。

### 生成 Chrome Web Store 发布包

测试部署和正式打包共用 `scripts/extension-files.json` 中的运行文件清单。生成发布包：

```powershell
pwsh -File .\scripts\package.ps1
```

输出文件名从 Manifest 版本号生成：

```text
dist/OpenInNewTab-2.0.0.zip
```

同版本文件已经存在时，脚本会停止。确认需要重新生成时使用：

```powershell
pwsh -File .\scripts\package.ps1 -Force
```

脚本会检查 Manifest V3、版本号、文件路径、Manifest 引用、ZIP 条目和每个文件的 SHA256。ZIP 使用固定文件顺序和时间戳，相同源码会生成相同哈希。

### 干净 Profile 验收

自动检查发布包能否在全新 Chromium Profile 中启动：

```powershell
pwsh -File .\scripts\test-clean-package.ps1
```

启动独立的可见测试 Profile，完成人工权限和真实网站验收：

```powershell
pwsh -File .\scripts\start-clean-test.ps1 -Reset
```

脚本优先使用 Google Chrome，本机没有 Chrome 时使用 Microsoft Edge。自动验收允许使用 Edge，但提交 Chrome Web Store 前必须使用当前稳定版 Chrome 按 [`docs/release-checklist.md`](docs/release-checklist.md) 再验收一次。测试 Profile 位于系统临时目录，不读取现有浏览器 Profile。

## 使用

点击扩展图标后，可以为当前网站选择：

- **选择页面上的链接：** 点击一个链接，调整同类链接范围，并按需排除其他链接
- **该网站的所有链接：** 让当前网站中的标准链接在新标签中打开
- **管理全部规则：** 编辑适用范围、选择器和打开方式，并导入或导出规则

仓库中的 [`rule-sets`](rule-sets/) 目录提供可选规则集。扩展不会自动下载或启用这些规则，用户可以下载 JSON 文件后在设置页预览并按需导入。

可视化选择时：

- 蓝色表示将在新标签中打开
- 红色表示已排除
- 橙色表示鼠标当前指向的链接

## 打开方式

- **兼容模式：** 保留网站原有点击处理，适合普通链接
- **保护模式：** 阻止网站接管点击，由浏览器执行链接的原生新标签导航

保护模式仍然保留真实 `href`，不会把链接替换成 `javascript:void(0)`，因此中键、右键菜单和复制链接仍然可用。

## 权限

扩展使用以下权限：

- `activeTab`：用户点击扩展图标后，临时读取当前页面以启动可视化选择
- `scripting`：在用户授权的网站中运行规则和可视化选择器
- `storage`：保存并同步用户设置的规则
- 可选网站权限：仅在用户为某个网站创建规则时申请

详情见 [隐私说明](PRIVACY.md)。

## 开发与验证

检查 JavaScript 语法：

```bash
node --check main.js
node --check picker.js
node --check popup/popup.js
node --check options/options.js
node --check service-worker.js
```

运行规则测试：

```bash
node --test tests/rules.test.js
```

`tests/force-mode.html`、`tests/picker-exclusion.html` 和 `tests/picker-edit.html` 是真实 DOM 行为页面，可使用 Chromium 浏览器加载验证。

## 项目结构

```text
manifest.json          Manifest V3 清单
service-worker.js      权限、动态脚本注册和规则保存
main.js                页面链接处理
picker.js              可视化选择与排除
rules.js               规则格式、验证和页面匹配
storage.js             规则存储
popup/                  当前网站入口
options/                全部规则管理
tests/                  模块和浏览器行为测试
rule-sets/               可选下载和导入的社区规则集
```

## 当前状态

Manifest V3 `2.0.0` 已于 2026-09-01 提交 Chrome Web Store，当前正在审核。提交文案、权限说明和发布清单见 [`docs/web-store-submission.md`](docs/web-store-submission.md)。
