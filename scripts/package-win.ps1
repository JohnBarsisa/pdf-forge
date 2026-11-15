param([string] $RuntimeVersion = '45.3.2')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$out = Join-Path $PWD 'out'
$work = Join-Path $out 'PDF-Forge-win-x64'
if (!(Test-Path 'app/vendor/pdf.worker.min.mjs')) { throw 'Run npm run vendor first.' }
New-Item $out -ItemType Directory -Force | Out-Null
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
$zip = "electron-v$RuntimeVersion-win32-x64.zip"
$releases = "https://github.com/electron/electron/releases/download/v$RuntimeVersion"
$checks = (Invoke-WebRequest -Uri "$releases/SHASUMS256.txt" -UseBasicParsing).Content
$expected = ($checks -split "`n" | Where-Object { $_ -match (" " + [regex]::Escape($zip) + "\s*$") } | Select-Object -First 1) -replace '\s+.*$', ''
if ($expected -notmatch '^[0-9a-fA-F]{64}$') { throw 'Electron package checksum not found.' }
$runtime = Join-Path $out $zip
Invoke-WebRequest -Uri "$releases/$zip" -OutFile $runtime -UseBasicParsing
if ((Get-FileHash $runtime -Algorithm SHA256).Hash -ine $expected) { throw 'Electron runtime checksum failed.' }
Expand-Archive -Path $runtime -DestinationPath $work
Remove-Item (Join-Path $work 'resources/default_app.asar') -ErrorAction SilentlyContinue
$target = New-Item (Join-Path $work 'resources/app') -ItemType Directory -Force
Copy-Item -Path 'app','desktop','package.json' -Destination $target.FullName -Recurse
Rename-Item (Join-Path $work 'electron.exe') 'PDF Forge.exe'
$package = Join-Path $out 'PDF-Forge-Windows-x64.zip'
Compress-Archive -Path $work -DestinationPath $package -CompressionLevel Fastest -Force
Write-Output $package
