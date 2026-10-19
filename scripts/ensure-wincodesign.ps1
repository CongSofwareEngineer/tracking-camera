# Bảo đảm có signtool.exe trong cache winCodeSign của electron-builder — KHÔNG cần quyền admin.
#
# Vì sao cần script này:
#   electron-builder tải winCodeSign-2.6.0.7z rồi GIẢI NÉN bằng 7za. Gói này chứa vài
#   symlink của macOS (darwin/.../libcrypto.dylib, libssl.dylib). Trên Windows, tạo symlink
#   cần quyền admin / Developer Mode → 7za báo "A required privilege is not held by the client"
#   và electron-builder DỪNG (kể cả khi chỉ build .exe). Máy không admin sẽ kẹt ở đây.
#
# Cách xử lý: tự giải nén .7z nhưng LOẠI BỎ thư mục 'darwin' (chỉ cần windows-10/signtool.exe
# để ký trên Windows). Đặt vào đúng thư mục electron-builder mong đợi (winCodeSign-2.6.0) để
# nó dùng lại, không giải nén lại.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$cache = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\winCodeSign'
$target = Join-Path $cache 'winCodeSign-2.6.0'
$signtool = Join-Path $target 'windows-10\x64\signtool.exe'

if (Test-Path $signtool) {
  Write-Host "[wincodesign] Đã có signtool: $signtool"
  exit 0
}

New-Item -ItemType Directory -Force -Path $cache | Out-Null

# Tìm .7z đã tải sẵn trong cache (electron-builder để lại), nếu không có thì tải về.
$sevenZip = Get-ChildItem $cache -Filter '*.7z' -ErrorAction SilentlyContinue |
  Where-Object { $_.Length -gt 1MB } | Select-Object -First 1
if (-not $sevenZip) {
  $url = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z'
  $dest = Join-Path $cache 'winCodeSign-2.6.0.7z'
  Write-Host "[wincodesign] Tải winCodeSign-2.6.0.7z…"
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
  $sevenZip = Get-Item $dest
}

# 7za đi kèm electron-builder.
$za = Join-Path $root 'node_modules\7zip-bin\win\x64\7za.exe'
if (-not (Test-Path $za)) { throw "[wincodesign] Không thấy 7za: $za" }

if (Test-Path $target) { Remove-Item $target -Recurse -Force }
Write-Host "[wincodesign] Giải nén (bỏ qua darwin) → $target"
# -x!darwin: bỏ thư mục darwin chứa symlink (không cần cho ký Windows).
& $za x $sevenZip.FullName "-o$target" '-x!darwin' '-y' | Out-Null

if (-not (Test-Path $signtool)) {
  throw "[wincodesign] Giải nén xong nhưng vẫn không thấy signtool: $signtool"
}
Write-Host "[wincodesign] OK → $signtool"
