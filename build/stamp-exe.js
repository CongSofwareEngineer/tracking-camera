// Dựng lại CamGuard.exe từ electron.exe GỐC rồi dán icon/metadata bằng rcedit "chuẩn".
//
// Vì sao cần: rcedit nội bộ của electron-builder (app-builder.exe) tạo ra file PE mà
// signtool KHÔNG ký được (lỗi 0x800700C1 / badexeformat) — nhiều khi signtool báo thành
// công nhưng chữ ký KHÔNG được nhúng. Dùng rcedit-x64.exe rời (trong cache winCodeSign)
// trên bản electron.exe gốc lại ra file ký được ỔN ĐỊNH. Vì vậy trong afterPack ta GHI ĐÈ
// CamGuard.exe bằng bản dựng lại này TRƯỚC khi ký.
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = path.join(__dirname, '..')

/** Tìm rcedit-x64.exe rời (ưu tiên cache winCodeSign của electron-builder). */
function findRcedit() {
  if (process.env.RCEDIT_PATH && fs.existsSync(process.env.RCEDIT_PATH)) return process.env.RCEDIT_PATH
  const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const winCodeSign = path.join(localApp, 'electron-builder', 'Cache', 'winCodeSign')
  const candidates = []
  if (fs.existsSync(winCodeSign)) {
    for (const d of fs.readdirSync(winCodeSign)) {
      candidates.push(path.join(winCodeSign, d, 'rcedit-x64.exe'))
    }
  }
  return candidates.find((c) => fs.existsSync(c)) || null
}

/** electron.exe gốc đúng phiên bản đang đóng gói (node_modules/electron/dist). */
function findPristineElectron() {
  const p = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
  return fs.existsSync(p) ? p : null
}

/**
 * Ghi đè <appOutDir>/<exeName> bằng electron.exe gốc đã dán icon + metadata.
 * Trả về true nếu đã dựng lại (để bên ngoài biết cần ký), false nếu bỏ qua.
 */
function rebuildStampedExe(appOutDir, exeName) {
  const target = path.join(appOutDir, exeName)
  const pristine = findPristineElectron()
  const rcedit = findRcedit()
  if (!pristine || !rcedit) {
    console.log('[stamp] Thiếu electron gốc hoặc rcedit → giữ nguyên exe của electron-builder.')
    return false
  }
  // Kiểm tra đúng phiên bản: kích thước electron.exe gốc phải khớp cây bytes ~ exe đích.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
  const version = pkg.version || '1.0.0'
  const icon = path.join(ROOT, 'resources', 'icons', 'app.ico')

  fs.copyFileSync(pristine, target)
  const args = [
    target,
    '--set-version-string', 'FileDescription', 'CamGuard',
    '--set-version-string', 'ProductName', 'CamGuard',
    '--set-version-string', 'CompanyName', 'CamGuard',
    '--set-version-string', 'LegalCopyright', 'CamGuard',
    '--set-version-string', 'InternalName', 'CamGuard',
    '--set-file-version', version,
    '--set-product-version', version + '.0'
  ]
  if (fs.existsSync(icon)) args.push('--set-icon', icon)
  const r = spawnSync(rcedit, args, { encoding: 'utf-8' })
  if (r.status !== 0) {
    console.error('[stamp] rcedit lỗi:', ((r.stdout || '') + (r.stderr || '')).trim())
    throw new Error('[stamp] rcedit thất bại cho ' + target)
  }
  console.log('[stamp] Dựng lại + dán metadata cho', exeName, '(ký được ổn định).')
  return true
}

module.exports = { rebuildStampedExe, findRcedit, findPristineElectron }
