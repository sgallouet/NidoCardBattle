param(
    [string]$WorldXploreRepo = ""
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($WorldXploreRepo)) {
    $WorldXploreRepo = Join-Path (Split-Path $repoRoot -Parent) 'WorldXplore'
}
$WorldXploreRepo = (Resolve-Path $WorldXploreRepo).Path

$items = @(
    @{
        Name = 'hunter arrow'
        Source = 'public\assets\combat\hunter-arrow.png'
        Destination = 'assets\game\vfx\combat\hunter-arrow.png'
        Blob = 'f4120880eb444952ad80cbd63be3d52ac820e00a'
    },
    @{
        Name = 'sword swing atlas'
        Source = 'public\assets\fx\sword-swing\sword-swing-atlas.png'
        Destination = 'assets\game\vfx\combat\sword-swing-atlas.png'
        Blob = '49bef9a6bde47d956bb702f8cd2c0053b79913c0'
    }
)

foreach ($item in $items) {
    $source = Join-Path $WorldXploreRepo $item.Source
    if (-not (Test-Path $source -PathType Leaf)) {
        throw "Missing WorldXplore $($item.Name): $source"
    }

    $destination = Join-Path $repoRoot $item.Destination
    New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force

    $actualBlob = (& git -C $repoRoot hash-object -- $destination).Trim()
    if ($LASTEXITCODE -ne 0 -or $actualBlob -ne $item.Blob) {
        Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue
        throw "Copied $($item.Name) did not match the accepted WorldXplore blob. Expected $($item.Blob), got $actualBlob."
    }

    Write-Host "Copied $($item.Name) -> $($item.Destination) [$actualBlob]"
}

Write-Host 'WorldXplore combat VFX import complete.'
