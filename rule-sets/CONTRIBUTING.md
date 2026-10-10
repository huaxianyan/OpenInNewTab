# 贡献社区规则

## 准备规则

1. 在目标网站中使用扩展的可视化选择创建规则
2. 验证普通点击、中键、右键菜单和组合键操作
3. 排除分页、账号菜单、退出、删除、支付等不应处理的链接
4. 在设置页点击「导出规则」，勾选目标网站的规则，选择「社区规则用」导出 ZIP
5. 只保留同一网站相关的规则，并填写清晰的标题、说明和来源页面

兼容模式能够工作时，不使用保护模式。不要提交账号信息、Cookie、页面内容或其他个人数据。

## 从浏览器导出规则

设置页右上角的「导出规则」按钮会打开选择窗口，勾选需要的规则后有两种导出方式：

- **导入用**：选中的规则合并成一个 `.json` 文件，可以再次导入扩展。
- **社区规则用**：按网站拆成多个规则文件并打包成 ZIP，解压后可直接放入 `rule-sets/`。

提交社区规则用「社区规则用」；只想备份或迁移规则时用「导入用」。

如果规则已经在一个开启了远程调试端口的浏览器里，也可以直接用脚本导出，并按网站写入 `rule-sets/`：

```bash
# 导出成一个文件
node scripts/export-chrome-rules.mjs --port 9222 --out rules.json

# 按网站拆成 rule-sets/<站点>.json，并自动重写 rule-sets/index.json
node scripts/export-chrome-rules.mjs --port 9222 --split
```

不知道端口时，用 `--profile "<浏览器用户目录>"` 代替 `--port`，脚本会读取该目录下的 `DevToolsActivePort` 文件。`--split` 会覆盖同名规则文件，提交前请用 `git diff` 检查拆分结果。

## 加入默认上游

1. 将规则文件保存到 `rule-sets/`，文件名使用简短的小写网站名称
2. 在 `rule-sets/README.md` 中加入网站入口
3. 提交 PR

`rule-sets/index.json` 由 GitHub Actions 自动维护，**不需要手工修改，也不需要提交索引变更**。合并到 `main` 后，工作流会扫描 `rule-sets/` 下的所有 `.json`（排除 `index.json`），校验格式后按文件名排序重写 `files`，并保留索引里已有的 `title` 和 `description`，然后自动提交。

PR 只会校验规则文件本身是否合法：格式/版本不对、选择器为空、页面范围无效的规则都会让检查失败，不会合并。

维护者想在本地预览或手动同步索引时：

```bash
node scripts/sync-rule-index.mjs            # 写入 index.json
node scripts/sync-rule-index.mjs --check    # 只检查是否已同步
node scripts/sync-rule-index.mjs --validate # 只校验规则文件
```

提交前建议运行 `node --test tests/*.test.js`，它会通过扩展自身的规则解析入口验证索引和规则文件。

## 自动化

[`.github/workflows/rule-sets.yml`](../.github/workflows/rule-sets.yml) 负责索引维护：

- `pull_request`（涉及 `rule-sets/**`）：运行 `--validate` 和规则测试，校验提交的规则文件。
- `push` 到 `main`（涉及 `rule-sets/**`）：运行同步脚本、`--check` 和全部测试，然后提交 `rule-sets/index.json`。

如果 `main` 开启了分支保护、禁止直接推送，需要允许 GitHub Actions 推送，或为该工作流改用个人访问令牌，否则机器人无法提交索引。

## 安全边界

规则和上游索引只能包含结构化 JSON 数据：

- 不允许 JavaScript、CSS 文件或可执行内容
- 不允许把选择器当作脚本执行
- 索引只能引用与自身位于同一站点的 HTTP 或 HTTPS 规则文件
- 扩展不会后台更新或自动启用社区规则
- 用户必须查看、选择并批准目标网站权限后才能导入

规则文件格式和上游索引格式见 [`README.md`](README.md)。
