param(
    [string]$ArchivePath,
    [string]$BrowserPath
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "browser-test-tools.ps1")

if (-not $ArchivePath) {
    $ArchivePath = Get-DefaultExtensionArchive -ProjectRoot $ProjectRoot
}
$Browser = Resolve-ChromiumBrowser -BrowserPath $BrowserPath
$TestRoot = Join-Path $env:TEMP "OpenInNewTab-clean-smoke"
$ExtensionPath = Join-Path $TestRoot "extension"
$ProfilePath = Join-Path $TestRoot "profile"

Stop-TestBrowser -ProfilePath $ProfilePath
Remove-Item -LiteralPath $TestRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $ExtensionPath, $ProfilePath -Force | Out-Null
$Manifest = Expand-ExtensionArchive -ArchivePath $ArchivePath -Destination $ExtensionPath

$BrowserProcess = Start-Process $Browser -ArgumentList @(
    "--headless=new"
    "--disable-gpu"
    "--no-first-run"
    "--remote-debugging-port=0"
    "--user-data-dir=$ProfilePath"
    "--disable-extensions-except=$ExtensionPath"
    "--load-extension=$ExtensionPath"
    "about:blank"
) -PassThru

try {
    $PortFile = Join-Path $ProfilePath "DevToolsActivePort"
    for ($Attempt = 0; $Attempt -lt 100 -and -not (Test-Path $PortFile); $Attempt += 1) {
        Start-Sleep -Milliseconds 100
    }
    if (-not (Test-Path $PortFile)) {
        throw "浏览器没有开放测试端口。"
    }

    $Port = (Get-Content -LiteralPath $PortFile)[0]
    $Evaluator = Join-Path $PSScriptRoot "cdp-evaluate.mjs"
    $Worker = & node (Join-Path $PSScriptRoot "discover-extension.mjs") $Port $Manifest.version |
        ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $Worker) {
        throw "没有找到发布包对应的 service worker。"
    }

    $ExtensionId = ([Uri]([string]$Worker.url)).Host
    $WorkerExpression = @'
(async () => {
  const manifest = chrome.runtime.getManifest();
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  return {
    name: manifest.name,
    version: manifest.version,
    manifestVersion: manifest.manifest_version,
    registeredScripts: scripts.length
  };
})()
'@
    $WorkerResult = & node $Evaluator $Worker.webSocketDebuggerUrl $WorkerExpression |
        ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "无法检查扩展 service worker。" }
    if ($WorkerResult.manifestVersion -ne 3 -or $WorkerResult.version -ne $Manifest.version) {
        throw "service worker 读取到的 Manifest 与发布包不一致。"
    }

    function Open-And-InspectExtensionPage {
        param(
            [string]$RelativeUrl,
            [string]$Expression
        )
        $Url = [Uri]::EscapeDataString("chrome-extension://$ExtensionId/$RelativeUrl")
        $Target = Invoke-RestMethod -Method Put "http://127.0.0.1:$Port/json/new?$Url"
        $Result = & node $Evaluator $Target.webSocketDebuggerUrl $Expression |
            ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) { throw "无法检查扩展页面：$RelativeUrl" }
        return $Result
    }

    $PageExpression = @'
new Promise((resolve) => setTimeout(() => resolve({
  readyState: document.readyState,
  title: document.title,
  heading: document.querySelector("h1")?.textContent || ""
}), 300))
'@
    $PopupResult = Open-And-InspectExtensionPage -RelativeUrl "popup/popup.html" -Expression $PageExpression
    $OptionsResult = Open-And-InspectExtensionPage -RelativeUrl "options/options.html" -Expression $PageExpression
    if ($PopupResult.readyState -ne "complete" -or -not $PopupResult.heading) {
        throw "Popup 没有正常加载。"
    }
    if ($OptionsResult.readyState -ne "complete" -or -not $OptionsResult.heading) {
        throw "设置页没有正常加载。"
    }

    Write-Host "干净 Profile 自动验收通过。"
    Write-Host "浏览器：$Browser"
    Write-Host "扩展 ID：$ExtensionId"
    Write-Host "版本：$($WorkerResult.version)"
    Write-Host "Popup：$($PopupResult.heading)"
    Write-Host "设置页：$($OptionsResult.heading)"
} finally {
    Stop-TestBrowser -ProfilePath $ProfilePath
    Remove-Item -LiteralPath $TestRoot -Recurse -Force -ErrorAction SilentlyContinue
}
