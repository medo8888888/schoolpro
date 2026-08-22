$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$www = Join-Path $root 'www'
$files = @(
  '*.html',
  '*.js',
  '*.css',
  'manifest.json',
  'sw.js'
)

foreach ($pattern in $files) {
  Get-ChildItem -Path $root -Filter $pattern -File | Copy-Item -Destination $www -Force
}

Write-Output "Synced web assets from $root to $www"