$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$buildDir = Join-Path $repoRoot 'dist'
$releaseDir = Join-Path $repoRoot 'release/itch'
$finalZip = Join-Path $releaseDir 'NidoCardBattle-itch.zip'
$tempZip = Join-Path $releaseDir 'NidoCardBattle-itch.next.zip'

Write-Host '[1/4] Building NidoCardBattle...'
& npm.cmd run build
if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed with exit code $LASTEXITCODE"
}

$indexPath = Join-Path $buildDir 'index.html'
if (-not (Test-Path $indexPath)) {
    throw 'dist/index.html is missing after the build.'
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
if (Test-Path $tempZip) {
    Remove-Item -Force $tempZip
}

Write-Host '[2/4] Packaging dist contents with index.html at archive root...'
Compress-Archive -Path (Join-Path $buildDir '*') -DestinationPath $tempZip -Force

Write-Host '[3/4] Validating itch.io archive...'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($tempZip)
try {
    $names = @($zip.Entries | ForEach-Object { $_.FullName })

    if (-not ($names -contains 'index.html')) {
        throw 'index.html is not at the root of the ZIP.'
    }

    if (@($names | Where-Object { $_ -match '\\' }).Count -gt 0) {
        throw 'ZIP contains Windows backslash paths; itch.io expects portable slash paths.'
    }

    if (@($names | Where-Object { $_ -match '^assets/.+\.js$' }).Count -eq 0) {
        throw 'No built JavaScript bundle was found under assets/.'
    }

    if (@($names | Where-Object { $_ -match '^assets/.+\.(png|webp|jpe?g)$' }).Count -eq 0) {
        throw 'No packaged image art was found under assets/.'
    }

    if (@($names | Where-Object { $_ -match '^assets/royal-guard-.+\.webp$' }).Count -eq 0) {
        throw 'Expected Royal Guard card art was not found in the packaged build.'
    }
}
finally {
    $zip.Dispose()
}

$html = Get-Content -Raw $indexPath
if ($html -match '(?:src|href)=["'']/') {
    throw 'dist/index.html contains a root-absolute src/href. Keep Vite base set to ./ for itch.io.'
}

Write-Host '[4/4] Promoting validated archive...'
if (Test-Path $finalZip) {
    Remove-Item -Force $finalZip
}
Move-Item -Force $tempZip $finalZip

Write-Host ''
Write-Host 'Itch.io package ready:'
Write-Host $finalZip
