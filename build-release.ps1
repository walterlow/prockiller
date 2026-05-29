#!/usr/bin/env pwsh
# Builds an optimized release binary and stages a versioned artifact in dist/.
# Mirrors .github/workflows/release.yml so local builds match CI.

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host 'Building release...' -ForegroundColor Cyan
cargo build --release --locked
if ($LASTEXITCODE -ne 0) { throw "cargo build failed with exit code $LASTEXITCODE" }

$version = (Select-String -Path Cargo.toml -Pattern '^version = "(.*)"').Matches[0].Groups[1].Value
New-Item -ItemType Directory -Force -Path dist | Out-Null

$artifact = "dist\prockiller-iced-v$version-windows-x64.exe"
Copy-Item target\release\prockiller-iced.exe $artifact -Force

$hash = (Get-FileHash $artifact -Algorithm SHA256).Hash.ToLower()
"$hash  $(Split-Path $artifact -Leaf)" | Out-File "$artifact.sha256" -Encoding ascii

Write-Host "Staged artifact: $artifact" -ForegroundColor Green
Write-Host "SHA256: $hash" -ForegroundColor Green
