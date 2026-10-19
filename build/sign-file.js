// Ký một file .exe bằng signtool.exe + chứng chỉ tự ký ở build/cert/.
//
// Vì sao signtool mà không phải Set-AuthenticodeSignature:
//   - Set-AuthenticodeSignature trên file Electron ~180MB hay trả 'UnknownError'
//     ("%1 is not a valid Win32 application") CHẬP CHỜN do Windows Defender khoá tạm
//     file vừa ghi — và nhiều khi KHÔNG ký được thật. signtool ổn định, mã thoát rõ ràng.
//   - Lỗi 0x800700C1 (ERROR_BAD_EXE_FORMAT) chỉ là tạm thời → THỬ LẠI vài lần là ký được.
//
// signtool lấy từ cache winCodeSign của electron-builder (được bảo đảm bởi
// scripts/ensure-wincodesign.ps1). verify báo "not trusted root" là BÌNH THƯỜNG với
// cert tự ký chưa import; trên laptop đích chạy scripts/trust-cert.ps1 một lần là hết.
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = path.join(__dirname, '..')
const PFX = path.join(ROOT, 'build', 'cert', 'camguard-codesign.pfx')
const PWD = path.join(ROOT, 'build', 'cert', 'password.txt')

const TIMESTAMP_SERVERS = [
  'http://timestamp.digicert.com',
  'http://timestamp.sectigo.com',
  'http://time.certum.pl'
]
const MAX_ATTEMPTS = 8
const RETRY_DELAY_MS = 1500

function certAvailable() {
  return fs.existsSync(PFX) && fs.existsSync(PWD)
}

/** Tìm signtool.exe: biến môi trường → cache winCodeSign → Windows SDK. */
function findSigntool() {
  if (process.env.SIGNTOOL_PATH && fs.existsSync(process.env.SIGNTOOL_PATH)) {
    return process.env.SIGNTOOL_PATH
  }
  const candidates = []
  const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const winCodeSign = path.join(localApp, 'electron-builder', 'Cache', 'winCodeSign')
  if (fs.existsSync(winCodeSign)) {
    for (const d of fs.readdirSync(winCodeSign)) {
      candidates.push(path.join(winCodeSign, d, 'windows-10', 'x64', 'signtool.exe'))
      candidates.push(path.join(winCodeSign, d, 'windows-10', 'arm64', 'signtool.exe'))
    }
  }
  for (const kitBase of [
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin',
    'C:\\Program Files\\Windows Kits\\10\\bin'
  ]) {
    if (!fs.existsSync(kitBase)) continue
    for (const v of fs.readdirSync(kitBase)) {
      candidates.push(path.join(kitBase, v, 'x64', 'signtool.exe'))
    }
  }
  return candidates.find((c) => fs.existsSync(c)) || null
}

function sleep(ms) {
  const sab = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(sab, 0, 0, ms)
}

function runSigntool(signtool, file, password, timestamp) {
  const args = ['sign', '/f', PFX, '/p', password, '/fd', 'sha256']
  if (timestamp) args.push('/tr', timestamp, '/td', 'sha256')
  args.push(file)
  const r = spawnSync(signtool, args, { encoding: 'utf-8' })
  return { status: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim() }
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
  const signtool = findSigntool()
  if (!signtool) {
    throw new Error('[sign] Không tìm thấy signtool.exe — chạy "npm run ensure:wincodesign" trước.')
  }
  const password = fs.readFileSync(PWD, 'utf-8').trim()
  const base = path.basename(file)
  let lastOut = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Lần lượt từng timestamp server, cuối cùng thử KHÔNG timestamp.
    for (const ts of [...TIMESTAMP_SERVERS, null]) {
      const { status, out } = runSigntool(signtool, file, password, ts)
      lastOut = out
      if (status === 0) {
        console.log(`[sign] ${base} -> OK${ts ? ' (timestamp ' + ts + ')' : ' (không timestamp)'}`)
        return
      }
      // Lỗi do timestamp/mạng → thử server kế tiếp (rồi bỏ timestamp) ngay, không chờ.
      if (ts && /timestamp|0x80096004|RPC|server|timed out|unable to/i.test(out)) continue
      // Lỗi khác (vd badexeformat) → thoát vòng ts để retry sau khi chờ.
      break
    }
    if (attempt < MAX_ATTEMPTS) {
      console.log(`[sign] ${base}: chưa ký được, thử lại (${attempt}/${MAX_ATTEMPTS})…`)
      sleep(RETRY_DELAY_MS)
    }
  }
  console.error(lastOut)
  throw new Error(`[sign] Ký thất bại sau ${MAX_ATTEMPTS} lần: ${file}`)
}

module.exports = { signFile, certAvailable, findSigntool }
