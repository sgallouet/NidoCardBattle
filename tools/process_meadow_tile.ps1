param(
  [string]$Source = (Join-Path $PSScriptRoot '..\assets\source\terrain\meadow-clearing.png'),
  [string]$Output = (Join-Path $PSScriptRoot '..\assets\game\terrain\plain-meadow-hex.png')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$sourcePath = [System.IO.Path]::GetFullPath($Source)
$outputPath = [System.IO.Path]::GetFullPath($Output)
$outputDirectory = [System.IO.Path]::GetDirectoryName($outputPath)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
try {
  if ($sourceImage.Width -ne $sourceImage.Height) {
    throw "Expected a square meadow source, got $($sourceImage.Width)x$($sourceImage.Height)."
  }

  $cropSize = [Math]::Min(768, $sourceImage.Width)
  $cropX = [Math]::Floor(($sourceImage.Width - $cropSize) / 2)
  $cropY = [Math]::Floor(($sourceImage.Height - $cropSize) / 2)
  $outputSize = 512
  $supersample = 4
  $workingSize = $outputSize * $supersample

  $working = [System.Drawing.Bitmap]::new(
    $workingSize,
    $workingSize,
    [System.Drawing.Imaging.PixelFormat]::Format32bppPArgb
  )
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($working)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

      $half = $workingSize / 2
      $quarter = $workingSize / 4
      $points = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new($half, 0),
        [System.Drawing.PointF]::new($workingSize, $quarter),
        [System.Drawing.PointF]::new($workingSize, $quarter * 3),
        [System.Drawing.PointF]::new($half, $workingSize),
        [System.Drawing.PointF]::new(0, $quarter * 3),
        [System.Drawing.PointF]::new(0, $quarter)
      )
      $hexPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
      try {
        $hexPath.AddPolygon($points)
        $graphics.SetClip($hexPath)
        $destination = [System.Drawing.RectangleF]::new(0, 0, $workingSize, $workingSize)
        $sourceRect = [System.Drawing.RectangleF]::new($cropX, $cropY, $cropSize, $cropSize)
        $graphics.DrawImage($sourceImage, $destination, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
      } finally {
        $hexPath.Dispose()
      }
    } finally {
      $graphics.Dispose()
    }

    $result = [System.Drawing.Bitmap]::new(
      $outputSize,
      $outputSize,
      [System.Drawing.Imaging.PixelFormat]::Format32bppPArgb
    )
    try {
      $resultGraphics = [System.Drawing.Graphics]::FromImage($result)
      try {
        $resultGraphics.Clear([System.Drawing.Color]::Transparent)
        $resultGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $resultGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $resultGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $resultGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $resultGraphics.DrawImage($working, 0, 0, $outputSize, $outputSize)
      } finally {
        $resultGraphics.Dispose()
      }
      $result.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $result.Dispose()
    }
  } finally {
    $working.Dispose()
  }
} finally {
  $sourceImage.Dispose()
}

Write-Output "Generated $outputPath from centered ${cropSize}x${cropSize} crop."
