# Tạo chứng chỉ KÝ SỐ TỰ KÝ (self-signed) dùng nội bộ cho CamGuard.
#
# Mục đích: ký bộ cài .exe để khi mang sang laptop khác (của bạn), sau khi
# chạy scripts/trust-cert.ps1 một lần trên laptop đó, Windows KHÔNG còn hiện
# cảnh báo SmartScreen "Windows protected your PC / Run anyway" nữa.
#
# Sinh ra trong build/cert/ :
#   camguard-codesign.pfx   (có khoá riêng + mật khẩu) -> để KÝ lúc build (máy build giữ)
#   camguard-codesign.cer   (chỉ công khai)           -> mang sang laptop để TIN CẬY
#   password.txt            (mật khẩu pfx)             -> chỉ ở máy build (đã .gitignore)
#
# Chạy: powershell -ExecutionPolicy Bypass -File scripts/gen-cert.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root 'build/cert'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$pfxPath = Join-Path $certDir 'camguard-codesign.pfx'
$cerPath = Join-Path $certDir 'camguard-codesign.cer'
$pwdPath = Join-Path $certDir 'password.txt'

if (Test-Path $pfxPath) {
  Write-Host "[cert] Đã có $pfxPath — bỏ qua (xoá file này nếu muốn tạo lại)."
  exit 0
}

$subject = 'CN=CamGuard Local, O=CamGuard, C=VN'
Write-Host "[cert] Tạo chứng chỉ tự ký: $subject"

# Chứng chỉ ký số (code signing), hạn 10 năm.
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject $subject `
  -KeyUsage DigitalSignature `
  -KeyExportPolicy Exportable `
  -KeyAlgorithm RSA `
  -KeyLength 3072 `
  -HashAlgorithm SHA256 `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -NotAfter (Get-Date).AddYears(10)

# Mật khẩu ngẫu nhiên cho pfx
$plain = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
$securePwd = ConvertTo-SecureString -String $plain -Force -AsPlainText

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePwd | Out-Null
Export-Certificate   -Cert $cert -FilePath $cerPath | Out-Null
Set-Content -Path $pwdPath -Value $plain -Encoding ascii -NoNewline

# Gỡ khỏi store cá nhân để sạch (file pfx đã đủ để ký).
Remove-Item -Path ("Cert:\CurrentUser\My\" + $cert.Thumbprint) -Force

Write-Host "[cert] Xong:"
Write-Host "       PFX (ký khi build): $pfxPath"
Write-Host "       CER (tin cậy trên laptop): $cerPath"
Write-Host "       Mật khẩu PFX lưu ở: $pwdPath"
Write-Host ""
Write-Host "Từ giờ, 'npm run build:win' sẽ TỰ ĐỘNG ký bộ cài bằng chứng chỉ này."
Write-Host "Mang file .cer sang laptop rồi chạy scripts/trust-cert.ps1 (Admin) MỘT LẦN."
