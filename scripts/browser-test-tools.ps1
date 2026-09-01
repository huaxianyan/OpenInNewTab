function Resolve-ChromiumBrowser {
    param([string]$BrowserPath)

    if ($BrowserPath) {
        if (-not (Test-Path -LiteralPath $BrowserPath -PathType Leaf)) {
            throw "浏览器不存在：$BrowserPath"
        }
        return (Resolve-Path -LiteralPath $BrowserPath).Path
    }

    $Candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($Candidate in $Candidates) {
        if (Test-Path -LiteralPath $Candidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $Candidate).Path
        }
    }
    throw "没有找到 Google Chrome 或 Microsoft Edge。"
}

function Get-DefaultExtensionArchive {
    param([string]$ProjectRoot)

    $Manifest = Get-Content -LiteralPath (Join-Path $ProjectRoot "manifest.json") -Raw |
        ConvertFrom-Json
    return Join-Path $ProjectRoot "dist\OpenInNewTab-$($Manifest.version).zip"
}

function Expand-ExtensionArchive {
    param(
        [string]$ArchivePath,
        [string]$Destination
    )

    if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
        throw "发布包不存在：$ArchivePath"
    }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $Destination
    $ManifestPath = Join-Path $Destination "manifest.json"
    if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
        throw "发布包根目录中没有 manifest.json。"
    }
    $Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    if ($Manifest.manifest_version -ne 3) {
        throw "发布包不是 Manifest V3 扩展。"
    }
    return $Manifest
}

function Stop-TestBrowser {
    param([string]$ProfilePath)

    Get-CimInstance Win32_Process |
        Where-Object { $_.CommandLine -like "*$ProfilePath*" } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}
