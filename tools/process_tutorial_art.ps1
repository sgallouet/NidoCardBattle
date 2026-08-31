param(
  [string]$Ffmpeg = 'ffmpeg'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $repoRoot 'assets/source/ui/tutorial'
$outputDirectory = Join-Path $repoRoot 'assets/game/ui/tutorial'

$variants = @(
  @{ Source = 'tutorial-battle-grid-v2.png'; Output = 'tutorial-battle-grid-v2.webp' },
  @{ Source = 'tutorial-card-invocation-v2.png'; Output = 'tutorial-card-invocation-v2.webp' },
  @{ Source = 'tutorial-mana-sources-v2.png'; Output = 'tutorial-mana-sources-v2.webp' }
)

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

foreach ($variant in $variants) {
  $sourcePath = Join-Path $sourceDirectory $variant.Source
  $outputPath = Join-Path $outputDirectory $variant.Output

  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Tutorial source art is missing: $sourcePath"
  }

  & $Ffmpeg -hide_banner -loglevel error -y `
    -i $sourcePath `
    -c:v libwebp `
    -lossless 0 `
    -preset picture `
    -quality 90 `
    $outputPath

  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed while processing $sourcePath"
  }
}
