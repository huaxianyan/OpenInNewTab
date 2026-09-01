param(
    [string]$ArchivePath,
    [string]$BrowserPath,
    [string]$TestRoot = "$env:TEMP\OpenInNewTab-clean-manual",
    [switch]$Reset
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "browser-test-tools.ps1")

if (-not $ArchivePath) {
    $ArchivePath = Get-DefaultExtensionArchive -ProjectRoot $ProjectRoot
}
$Browser = Resolve-ChromiumBrowser -BrowserPath $BrowserPath
$ExtensionPath = Join-Path $TestRoot "extension"
$ProfilePath = Join-Path $TestRoot "profile"

if (Test-Path -LiteralPath $TestRoot) {
    if (-not $Reset) {
        throw "干净测试目录已经存在：$TestRoot`n使用 -Reset 关闭旧测试浏览器并重新创建。"
    }
    Stop-TestBrowser -ProfilePath $ProfilePath
    Remove-Item -LiteralPath $TestRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $ExtensionPath, $ProfilePath -Force | Out-Null
$Manifest = Expand-ExtensionArchive -ArchivePath $ArchivePath -Destination $ExtensionPath
$Arguments = @(
    "--no-first-run"
    "--no-default-browser-check"
    "--user-data-dir=$ProfilePath"
    "--disable-extensions-except=$ExtensionPath"
    "--load-extension=$ExtensionPath"
    "chrome://extensions/"
    "https://www.v2ex.com/"
)
Start-Process $Browser -ArgumentList $Arguments | Out-Null

Write-Host "已启动全新浏览器 Profile。"
Write-Host "浏览器：$Browser"
Write-Host "扩展版本：$($Manifest.version)"
Write-Host "发布包：$ArchivePath"
Write-Host "临时 Profile：$ProfilePath"
Write-Host "请按 docs/release-checklist.md 完成人工验收。"
