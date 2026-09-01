# 可选规则集

这个目录保存由社区维护、供用户自行下载和导入的规则集。扩展不会联网自动下载规则，也不会默认启用这里的规则。

## 使用

1. 下载需要的 `.json` 文件
2. 打开扩展的「管理全部规则」
3. 点击「导入规则」并选择文件
4. 查看规则集名称、说明、来源和规则明细
5. 取消勾选不需要的规则
6. 点击「导入所选规则」并批准对应网站权限

如果规则已经存在，预览中会显示「已存在，导入后将更新」。规则使用页面范围和链接选择范围识别重复项。

## 文件格式

```json
{
  "format": "open-in-new-tab-rules",
  "version": 1,
  "title": "规则集名称",
  "description": "规则集用途和适用页面说明。",
  "homepage": "https://example.com/rules",
  "rules": [
    {
      "name": "主题链接",
      "enabled": true,
      "pagePattern": "https://www.example.com/*",
      "linkSelector": "a.topic",
      "excludeSelector": "a.pagination",
      "mode": "compatible"
    }
  ]
}
```

字段说明：

- `format`：固定为 `open-in-new-tab-rules`
- `version`：当前固定为 `1`
- `title`：导入预览中显示的规则集名称
- `description`：适用范围、维护状态等说明
- `homepage`：规则来源页面，可为空字符串
- `rules`：可供用户逐条选择的规则
- `mode`：`compatible` 表示保留网站交互，`force` 表示阻止网站接管

规则文件只能包含结构化数据，不能包含或执行 JavaScript。

## 维护规则

提交规则集前应确认：

- 在目标网站当前版本中实际验证过
- 选择范围不会覆盖登录、退出、删除、支付等操作链接
- 排除分页、用户菜单等不应新标签打开的链接
- 兼容模式能够工作时不使用保护模式
- `homepage` 指向可供用户了解规则来源和反馈问题的页面

V2EX、NGA 和 P9 的规则会在从实际使用环境导出并复核后加入此目录。
