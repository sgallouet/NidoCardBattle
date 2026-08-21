param(
  [string]$Source = (Join-Path $PSScriptRoot '..\assets\source\generated\undead_skeletal_infantry_sheet.png'),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\assets\game\units\undead\skeletal_infantry')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$drawingAssemblies = @(
  [System.Drawing.Bitmap].Assembly.Location
  [System.Drawing.Rectangle].Assembly.Location
)
Add-Type -ReferencedAssemblies $drawingAssemblies -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class SpriteSheetCleanup
{
    public static void KeepLargestConnectedAlpha(Bitmap bitmap, byte alphaThreshold)
    {
        var bounds = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        var data = bitmap.LockBits(bounds, ImageLockMode.ReadWrite, PixelFormat.Format32bppPArgb);
        try
        {
            int byteCount = Math.Abs(data.Stride) * bitmap.Height;
            var pixels = new byte[byteCount];
            Marshal.Copy(data.Scan0, pixels, 0, byteCount);

            int pixelCount = bitmap.Width * bitmap.Height;
            var labels = new int[pixelCount];
            var queue = new int[pixelCount];
            int largestLabel = 0;
            int largestSize = 0;
            int nextLabel = 0;

            for (int y = 0; y < bitmap.Height; y++)
            {
                for (int x = 0; x < bitmap.Width; x++)
                {
                    int start = y * bitmap.Width + x;
                    int alphaOffset = y * data.Stride + x * 4 + 3;
                    if (labels[start] != 0 || pixels[alphaOffset] <= alphaThreshold)
                        continue;

                    nextLabel++;
                    int head = 0;
                    int tail = 0;
                    int componentSize = 0;
                    queue[tail++] = start;
                    labels[start] = nextLabel;

                    while (head < tail)
                    {
                        int current = queue[head++];
                        componentSize++;
                        int currentX = current % bitmap.Width;
                        int currentY = current / bitmap.Width;

                        for (int offsetY = -1; offsetY <= 1; offsetY++)
                        {
                            int neighborY = currentY + offsetY;
                            if (neighborY < 0 || neighborY >= bitmap.Height)
                                continue;

                            for (int offsetX = -1; offsetX <= 1; offsetX++)
                            {
                                if (offsetX == 0 && offsetY == 0)
                                    continue;

                                int neighborX = currentX + offsetX;
                                if (neighborX < 0 || neighborX >= bitmap.Width)
                                    continue;

                                int neighbor = neighborY * bitmap.Width + neighborX;
                                int neighborAlphaOffset = neighborY * data.Stride + neighborX * 4 + 3;
                                if (labels[neighbor] != 0 || pixels[neighborAlphaOffset] <= alphaThreshold)
                                    continue;

                                labels[neighbor] = nextLabel;
                                queue[tail++] = neighbor;
                            }
                        }
                    }

                    if (componentSize > largestSize)
                    {
                        largestSize = componentSize;
                        largestLabel = nextLabel;
                    }
                }
            }

            for (int y = 0; y < bitmap.Height; y++)
            {
                for (int x = 0; x < bitmap.Width; x++)
                {
                    int pixel = y * bitmap.Width + x;
                    if (labels[pixel] == largestLabel)
                        continue;

                    int offset = y * data.Stride + x * 4;
                    pixels[offset] = 0;
                    pixels[offset + 1] = 0;
                    pixels[offset + 2] = 0;
                    pixels[offset + 3] = 0;
                }
            }

            Marshal.Copy(pixels, 0, data.Scan0, byteCount);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }
}
'@

$sourcePath = [System.IO.Path]::GetFullPath($Source)
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($outputPath) | Out-Null

$frameSize = 200
$anchorX = 100
$anchorY = 175
$states = @(
  [pscustomobject]@{
    Name = 'idle'
    GroundY = 749
    Centers = @(126, 274, 421, 568, 716, 865, 1016, 1165)
  },
  [pscustomobject]@{
    Name = 'walk'
    GroundY = 930
    Centers = @(126, 277, 427, 576, 725, 876, 1025, 1175)
  },
  [pscustomobject]@{
    Name = 'attack'
    GroundY = 1160
    Centers = @(120, 275, 425, 575, 725, 875, 1025, 1175)
  }
)

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
try {
  if ($sourceImage.Width -ne 1278 -or $sourceImage.Height -ne 1230) {
    throw "Unexpected skeletal infantry sheet size: $($sourceImage.Width)x$($sourceImage.Height)."
  }

  foreach ($state in $states) {
    $strip = [System.Drawing.Bitmap]::new(
      $frameSize * $state.Centers.Count,
      $frameSize,
      [System.Drawing.Imaging.PixelFormat]::Format32bppPArgb
    )
    try {
      $stripGraphics = [System.Drawing.Graphics]::FromImage($strip)
      try {
        $stripGraphics.Clear([System.Drawing.Color]::Transparent)
        $stripGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy

        for ($index = 0; $index -lt $state.Centers.Count; $index += 1) {
          $center = $state.Centers[$index]
          $left = [Math]::Max(0, $center - $anchorX)
          $right = [Math]::Min($sourceImage.Width, $center + ($frameSize - $anchorX))
          $sourceRect = [System.Drawing.Rectangle]::new(
            $left,
            $state.GroundY - $anchorY,
            $right - $left,
            $frameSize
          )
          $destination = [System.Drawing.Rectangle]::new(
            $index * $frameSize + $anchorX - ($center - $left),
            0,
            $sourceRect.Width,
            $sourceRect.Height
          )
          $stripGraphics.DrawImage($sourceImage, $destination, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
        }
      } finally {
        $stripGraphics.Dispose()
      }

      for ($index = 0; $index -lt $state.Centers.Count; $index += 1) {
        $frame = $strip.Clone(
          [System.Drawing.Rectangle]::new($index * $frameSize, 0, $frameSize, $frameSize),
          [System.Drawing.Imaging.PixelFormat]::Format32bppPArgb
        )
        try {
          [SpriteSheetCleanup]::KeepLargestConnectedAlpha($frame, 8)
          $frameGraphics = [System.Drawing.Graphics]::FromImage($strip)
          try {
            $frameGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $frameGraphics.DrawImageUnscaled($frame, $index * $frameSize, 0)
          } finally {
            $frameGraphics.Dispose()
          }
        } finally {
          $frame.Dispose()
        }
      }

      $statePath = Join-Path $outputPath "$($state.Name).png"
      $strip.Save($statePath, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Output "Generated $statePath with $($state.Centers.Count) normalized frames."
    } finally {
      $strip.Dispose()
    }
  }
} finally {
  $sourceImage.Dispose()
}
