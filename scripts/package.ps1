param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$FileListPath = Join-Path $PSScriptRoot "extension-files.json"
$ManifestPath = Join-Path $ProjectRoot "manifest.json"
$Files = @(Get-Content -LiteralPath $FileListPath -Raw | ConvertFrom-Json)

if ($Files.Count -eq 0) {
    throw "发布文件清单为空。"
}
if (($Files | Select-Object -Unique).Count -ne $Files.Count) {
    throw "发布文件清单中存在重复路径。"
}
if ($Files -notcontains "manifest.json") {
    throw "发布文件清单必须包含根目录 manifest.json。"
}

foreach ($RelativePath in $Files) {
    if ([string]::IsNullOrWhiteSpace($RelativePath) -or
        [System.IO.Path]::IsPathRooted($RelativePath) -or
        $RelativePath -match '(^|[\\/])\.\.([\\/]|$)') {
        throw "发布文件路径无效：$RelativePath"
    }
    $Source = Join-Path $ProjectRoot $RelativePath
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        throw "发布文件不存在：$Source"
    }
}

$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($Manifest.manifest_version -ne 3) {
    throw "只能打包 Manifest V3 扩展。"
}
if ($Manifest.version -notmatch '^\d+(\.\d+){0,3}$') {
    throw "Manifest 版本号无效：$($Manifest.version)"
}

$ManifestReferences = @(
    $Manifest.background.service_worker
    $Manifest.action.default_popup
    $Manifest.options_ui.page
    $Manifest.icons.PSObject.Properties.Value
    $Manifest.action.default_icon.PSObject.Properties.Value
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
foreach ($Reference in $ManifestReferences) {
    if ($Files -notcontains ($Reference -replace '\\', '/')) {
        throw "Manifest 引用的文件不在发布清单中：$Reference"
    }
}

$DistDirectory = Join-Path $ProjectRoot "dist"
$ArchivePath = Join-Path $DistDirectory "OpenInNewTab-$($Manifest.version).zip"
New-Item -ItemType Directory -Path $DistDirectory -Force | Out-Null
if (Test-Path -LiteralPath $ArchivePath) {
    if (-not $Force) {
        throw "发布包已存在：$ArchivePath`n如需重新生成，请使用 -Force。"
    }
    Remove-Item -LiteralPath $ArchivePath -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$FixedTimestamp = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
$SortedFiles = @($Files | Sort-Object)

try {
    $Archive = [System.IO.Compression.ZipFile]::Open(
        $ArchivePath,
        [System.IO.Compression.ZipArchiveMode]::Create
    )
    try {
        foreach ($RelativePath in $SortedFiles) {
            $EntryName = $RelativePath -replace '\\', '/'
            $Entry = $Archive.CreateEntry(
                $EntryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            )
            $Entry.LastWriteTime = $FixedTimestamp
            $InputStream = [System.IO.File]::OpenRead((Join-Path $ProjectRoot $RelativePath))
            $OutputStream = $Entry.Open()
            try {
                $InputStream.CopyTo($OutputStream)
            } finally {
                $OutputStream.Dispose()
                $InputStream.Dispose()
            }
        }
    } finally {
        $Archive.Dispose()
    }

    $VerificationArchive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $ActualEntries = @($VerificationArchive.Entries.FullName | Sort-Object)
        $ExpectedEntries = @($SortedFiles | ForEach-Object { $_ -replace '\\', '/' })
        if (Compare-Object $ExpectedEntries $ActualEntries) {
            throw "发布包条目与发布文件清单不一致。"
        }

        foreach ($Entry in $VerificationArchive.Entries) {
            $RelativePath = $Entry.FullName -replace '/', [System.IO.Path]::DirectorySeparatorChar
            $SourceHash = (Get-FileHash -LiteralPath (Join-Path $ProjectRoot $RelativePath) -Algorithm SHA256).Hash
            $Hasher = [System.Security.Cryptography.SHA256]::Create()
            $EntryStream = $Entry.Open()
            try {
                $ArchiveHash = [BitConverter]::ToString($Hasher.ComputeHash($EntryStream)).Replace("-", "")
            } finally {
                $EntryStream.Dispose()
                $Hasher.Dispose()
            }
            if ($SourceHash -ne $ArchiveHash) {
                throw "发布包文件校验失败：$($Entry.FullName)"
            }
        }
    } finally {
        $VerificationArchive.Dispose()
    }
} catch {
    Remove-Item -LiteralPath $ArchivePath -Force -ErrorAction SilentlyContinue
    throw
}

$ArchiveHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
Write-Host "已生成 Chrome Web Store 发布包：$ArchivePath"
Write-Host "文件数量：$($Files.Count)"
Write-Host "SHA256：$ArchiveHash"
