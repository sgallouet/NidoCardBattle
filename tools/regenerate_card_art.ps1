Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$processor = Join-Path $PSScriptRoot 'process_card_art.ps1'

$cards = @(
  @{ Source = 'assets/source/cards/banner-captain-healing-aura.png'; Output = 'assets/game/cards/banner-captain.webp' },
  @{ Source = 'assets/source/cards/banshee-displacer.png'; Output = 'assets/game/cards/banshee.webp' },
  @{ Source = 'assets/source/cards/bone-archer.png'; Output = 'assets/game/cards/bone-archer.webp' },
  @{ Source = 'assets/source/cards/build-bridge.png'; Output = 'assets/game/cards/build-bridge.webp' },
  @{ Source = 'assets/source/cards/grave-knight-rule-aligned.png'; Output = 'assets/game/cards/grave-knight.webp' },
  @{ Source = 'assets/source/cards/grave-lock-transparent.png'; Output = 'assets/game/cards/grave-lock.webp' },
  @{ Source = 'assets/source/cards/thunder-mage.png'; Output = 'assets/game/cards/thunder-mage.webp' },
  @{ Source = 'assets/source/cards/longbow-ranger-rule-aligned.png'; Output = 'assets/game/cards/longbow-ranger.webp' },
  @{ Source = 'assets/source/cards/necromancer-rule-aligned.png'; Output = 'assets/game/cards/necromancer.webp' },
  @{ Source = 'assets/source/cards/profane-well-transparent.png'; Output = 'assets/game/cards/profane-well.webp' },
  @{ Source = 'assets/source/cards/raise-fort.png'; Output = 'assets/game/cards/raise-fort.webp' },
  @{ Source = 'assets/source/cards/royal-guard-rule-aligned.png'; Output = 'assets/game/cards/royal-guard.webp' },
  @{ Source = 'assets/source/cards/scorch-transparent.png'; Output = 'assets/game/cards/scorch.webp' },
  @{ Source = 'assets/source/cards/silverwing-cavalry-rule-aligned.png'; Output = 'assets/game/cards/silverwing-cavalry.webp' },
  @{ Source = 'assets/source/cards/skeletal-infantry-rule-aligned.png'; Output = 'assets/game/cards/skeletal-infantry.webp' },
  @{ Source = 'assets/source/cards/vampire.png'; Output = 'assets/game/cards/vampire.webp' },
  @{ Source = 'assets/source/cards/wind-adept-skybound-support-transparent.png'; Output = 'assets/game/cards/wind-adept.webp' },
  @{ Source = 'assets/source/cards/wraith.png'; Output = 'assets/game/cards/wraith.webp' }
)

Push-Location $repoRoot
try {
  foreach ($card in $cards) {
    & $processor -Source $card.Source -Output $card.Output
  }
} finally {
  Pop-Location
}

Write-Output "Regenerated $($cards.Count) high-resolution runtime cards."
