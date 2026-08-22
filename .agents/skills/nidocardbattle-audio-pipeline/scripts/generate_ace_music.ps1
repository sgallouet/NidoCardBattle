param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Caption,
    [Parameter(Mandatory = $true)][string]$VariationsFile,
    [double]$Duration = 60,
    [int]$Seed = 812700,
    [string]$NegativePrompt,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$python = 'D:\Grok\ACE-Step-1.5\.venv\Scripts\python.exe'
$script = Join-Path $PSScriptRoot 'generate_ace_music.py'

if (-not (Test-Path -LiteralPath $python)) {
    throw "ACE-Step Python environment not found at $python"
}

$arguments = @(
    $script,
    '--name', $Name,
    '--caption', $Caption,
    '--variations-file', $VariationsFile,
    '--duration', $Duration,
    '--seed', $Seed
)
if ($PSBoundParameters.ContainsKey('NegativePrompt')) {
    $arguments += @('--negative-prompt', $NegativePrompt)
}
if ($DryRun) {
    $arguments += '--dry-run'
}

& $python @arguments
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
