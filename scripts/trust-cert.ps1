# Tin cậy chứng chỉ CamGuard trên MỘT máy (vd laptop của bạn).
# Chạy bằng quyền Administrator, MỘT LẦN cho mỗi máy.
#
# Sau khi chạy, bộ cài CamGuard đã ký sẽ được coi là "nhà phát hành tin cậy",
# Windows không còn chặn bằng SmartScreen "Windows protected your PC / Run anyway".
#
# Dùng:
#   powershell -ExecutionPolicy Bypass -File scripts/trust-cert.ps1
#   (hoặc chỉ tới file .cer:  -CerPath D:\duong-dan\camguard-codesign.cer )
param(
  [string]$CerPath = ''
)
$ErrorActionPreference = 'Stop'

# Yêu cầu quyền Admin
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Error "Cần chạy PowerShell bằng quyền Administrator."
  exit 1
}

if (-not $CerPath) {
  $root = Split-Path -Parent $PSScriptRoot
  $CerPath = Join-Path $root 'build/cert/camguard-codesign.cer'
}
if (-not (Test-Path $CerPath)) {
  Write-Error "Không tìm thấy file .cer: $CerPath. Hãy copy camguard-codesign.cer sang máy này."
  exit 1
}

Write-Host "[trust] Import vào Trusted Root Certification Authorities (LocalMachine)"
Import-Certificate -FilePath $CerPath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null

Write-Host "[trust] Import vào Trusted Publishers (LocalMachine)"
Import-Certificate -FilePath $CerPath -CertStoreLocation 'Cert:\LocalMachine\TrustedPublisher' | Out-Null

Write-Host "[trust] Xong. Từ giờ bộ cài CamGuard đã ký được tin cậy trên máy này."
