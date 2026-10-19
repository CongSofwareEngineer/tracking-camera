# Build helper Windows → helpers/win/bin/camguard-helper-win.exe
# Mặc định: self-contained single-file (KHÔNG cần MSVC C++ build tools).
# Bật NativeAOT (nhỏ hơn, cần MSVC): đặt biến môi trường USE_AOT=1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$proj = Join-Path $root 'helpers/win/CamGuardHelper.csproj'
$binDir = Join-Path $root 'helpers/win/bin'
$tmp = Join-Path $root 'helpers/win/.publish'

# Tìm dotnet (winget cài vào C:\Program Files\dotnet)
$dotnet = 'dotnet'
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  $cand = 'C:\Program Files\dotnet\dotnet.exe'
  if (Test-Path $cand) { $dotnet = $cand }
  else { throw "Không tìm thấy dotnet. Cài .NET 8 SDK: winget install Microsoft.DotNet.SDK.8" }
}

$rid = if ($env:HELPER_RID) { $env:HELPER_RID } else { 'win-x64' }

New-Item -ItemType Directory -Force -Path $binDir | Out-Null
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }

if ($env:USE_AOT -eq '1') {
  Write-Host "[helper:win] publish NativeAOT ($rid)"
  & $dotnet publish $proj -c Release -r $rid -p:PublishAot=true -o $tmp
} else {
  Write-Host "[helper:win] publish self-contained single-file ($rid)"
  & $dotnet publish $proj -c Release -r $rid --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:PublishTrimmed=false -p:EnableCompressionInSingleFile=true -o $tmp
}
if ($LASTEXITCODE -ne 0) { throw "dotnet publish thất bại ($LASTEXITCODE)" }

$exe = Join-Path $tmp 'camguard-helper-win.exe'
if (-not (Test-Path $exe)) { throw "Không thấy output: $exe" }
Copy-Item $exe (Join-Path $binDir 'camguard-helper-win.exe') -Force
# dọn file tạm, giữ lại .exe
Remove-Item -Recurse -Force $tmp
Write-Host "[helper:win] xong → helpers/win/bin/camguard-helper-win.exe"
