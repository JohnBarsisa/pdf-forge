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
$runtime = Join-Path $out $zip
$bundled = Join-Path $PWD 'node_modules/electron/dist'
if (Test-Path (Join-Path $bundled 'electron.exe')) {
  $dependency = Get-Content 'node_modules/electron/package.json' -Raw | ConvertFrom-Json
  if ($dependency.version -ne $RuntimeVersion) { throw 'Installed Electron version does not match the package version.' }
  New-Item $work -ItemType Directory -Force | Out-Null
  Copy-Item -Path (Join-Path $bundled '*') -Destination $work -Recurse
} else {
  $checks = (Invoke-WebRequest -Uri "$releases/SHASUMS256.txt" -UseBasicParsing).Content
  $expected = ($checks -split "`n" | Where-Object { $_ -match (" " + [regex]::Escape($zip) + "\s*$") } | Select-Object -First 1) -replace '\s+.*$', ''
  if ($expected -notmatch '^[0-9a-fA-F]{64}$') { throw 'Electron package checksum not found.' }
  & curl.exe --fail --location --retry 3 --output $runtime "$releases/$zip"
  if ($LASTEXITCODE -ne 0) { throw 'Electron runtime download failed.' }
  $actual = (Get-FileHash $runtime -Algorithm SHA256).Hash
  if ($actual -ine $expected) { throw "Electron runtime checksum failed. Expected $expected, received $actual for $((Get-Item $runtime).Length) bytes." }
  Expand-Archive -Path $runtime -DestinationPath $work
}
Remove-Item (Join-Path $work 'resources/default_app.asar') -ErrorAction SilentlyContinue
$target = New-Item (Join-Path $work 'resources/app') -ItemType Directory -Force
Copy-Item -Path 'app','desktop','package.json' -Destination $target.FullName -Recurse
Rename-Item (Join-Path $work 'electron.exe') 'PDF Forge.exe'
$package = Join-Path $out 'PDF-Forge-Windows-x64.zip'
Compress-Archive -Path $work -DestinationPath $package -CompressionLevel Fastest -Force
Write-Output $package
