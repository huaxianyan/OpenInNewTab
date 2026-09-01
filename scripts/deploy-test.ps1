param(
    [string]$Target = "E:\dev\aboutblank"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Files = @(
    "icon128.png"
    "main.js"
    "picker.css"
    "picker.js"
    "rules.js"
    "service-worker.js"
    "storage.js"
    "options\options.css"
    "options\options.html"
    "options\options.js"
    "popup\popup.css"
    "popup\popup.html"
    "popup\popup.js"
    "manifest.json"
)

if (-not (Test-Path -LiteralPath $Target -PathType Container)) {
    throw "测试扩展目录不存在：$Target"
}

foreach ($RelativePath in $Files) {
    $Source = Join-Path $ProjectRoot $RelativePath
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        throw "发布文件不存在：$Source"
    }

    $Destination = Join-Path $Target $RelativePath
    $DestinationDirectory = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Path $DestinationDirectory -Force | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

Write-Host "已将测试版同步到 $Target"
Write-Host "请在 chrome://extensions/ 中刷新原扩展。"
