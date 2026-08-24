param(
  [Parameter(Mandatory = $true)]
  [string]$Source,

  [Parameter(Mandatory = $true)]
  [string]$Output
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$sourcePath = [System.IO.Path]::GetFullPath($Source)
$outputPath = [System.IO.Path]::GetFullPath($Output)

if (-not [System.IO.File]::Exists($sourcePath)) {
  throw "Card source does not exist: $sourcePath"
}

if ([System.IO.Path]::GetExtension($outputPath) -ne '.webp') {
  throw "Card output must be a WebP file: $outputPath"
}

$ffmpeg = Get-Command ffmpeg -ErrorAction Stop
$outputDirectory = [System.IO.Path]::GetDirectoryName($outputPath)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

& $ffmpeg.Source `
  -hide_banner `
  -loglevel error `
  -y `
  -i $sourcePath `
  -vf 'scale=512:768:flags=lanczos' `
  -frames:v 1 `
  -c:v libwebp `
  -lossless 1 `
  -compression_level 6 `
  $outputPath

if ($LASTEXITCODE -ne 0) {
  throw "ffmpeg failed to process card art: $sourcePath"
}

Write-Output "Generated $outputPath from $sourcePath."
