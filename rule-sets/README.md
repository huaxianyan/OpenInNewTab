# 可选规则集

这个目录保存由社区维护的规则集，也是扩展默认的规则上游。扩展只在用户点击获取时读取规则索引，不会后台轮询，也不会自动启用规则。

## 现有规则

- [PSNINE](psnine.json)
- [V2EX](v2ex.json)
- [NGA](nga.json)

## 使用

在扩展设置页的「云端规则」中点击「获取云端规则」，即可读取这个目录中的 [`index.json`](index.json)。选择一个规则集后，查看规则名称、说明、来源和明细，取消不需要的规则，再批准所选网站权限并导入。

也可以单独下载 `.json` 文件，通过「导入规则」从本地导入。

如果规则已经存在，预览中会显示「已存在，导入后将更新」。规则使用页面范围和链接选择范围识别重复项。

## 上游索引格式

上游地址指向索引 JSON。索引中的规则文件必须与索引位于同一站点，可以使用相对路径：

```json
{
  "format": "open-in-new-tab-rule-index",
  "version": 1,
  "title": "社区规则",
  "description": "可选的规则集。",
  "files": [
    "example.json"
  ]
}
```

用户可以在扩展设置中替换默认上游。扩展仅请求上游所在站点的访问权限，读取索引和其中列出的同站点规则文件；请求不携带网站 Cookie。

## 规则文件格式

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
