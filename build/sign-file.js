// Ký một file .exe bằng PowerShell Set-AuthenticodeSignature + chứng chỉ tự ký ở build/cert/.
// Dùng chung cho các hook afterPack / afterAllArtifactBuild của electron-builder.
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const PFX = path.join(ROOT, 'build', 'cert', 'camguard-codesign.pfx')
const PWD = path.join(ROOT, 'build', 'cert', 'password.txt')

function certAvailable() {
  return fs.existsSync(PFX) && fs.existsSync(PWD)
}

function signFile(file) {
  if (!certAvailable()) {
    console.log('[sign] Không có chứng chỉ → bỏ qua:', path.basename(file))
    return
  }
  if (!fs.existsSync(file)) {
    console.log('[sign] Không thấy file:', file)
    return
  }
  const password = fs.readFileSync(PWD, 'utf-8').trim()
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "''")
  const ps = `
$ErrorActionPreference = 'Stop'
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
  '${esc(PFX)}', '${esc(password)}',
  [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)
try {
  $r = Set-AuthenticodeSignature -FilePath '${esc(file)}' -Certificate $cert -HashAlgorithm SHA256 -TimestampServer 'http://timestamp.digicert.com'
} catch {
  $r = Set-AuthenticodeSignature -FilePath '${esc(file)}' -Certificate $cert -HashAlgorithm SHA256
}
Write-Output ('[sign] ' + (Split-Path -Leaf '${esc(file)}') + ' -> ' + $r.Status)
# 'Valid' = chuỗi tin cậy OK (cert đã được tin trên máy này).
# 'UnknownError' = ĐÃ KÝ nhưng chuỗi tin cậy chưa dựng được (bình thường với cert tự ký
#   chưa import trên máy build) — vẫn coi là thành công vì chữ ký đã có.
# Chỉ thất bại khi KHÔNG ký được (NotSigned/HashMismatch...).
if ($r.Status -eq 'NotSigned' -or $r.Status -eq 'HashMismatch') { exit 1 }
`.trim()

  const res = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    stdio: 'inherit'
  })
  if (res.status !== 0) throw new Error('[sign] Ký thất bại: ' + file)
}

module.exports = { signFile, certAvailable }
