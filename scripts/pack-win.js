#!/usr/bin/env node
/**
 * Đóng gói Windows + ký số local, dùng QUY TRÌNH 2 PHA.
 *
 * Vì sao 2 pha: electron-builder chạy rcedit nội bộ (app-builder) để dán icon/version, NHƯNG
 * rcedit đó làm file Electron ~180MB KHÔNG ký được (lỗi badexeformat) và nó chạy SAU hook
 * afterPack → ký trong afterPack vô ích. Cách chắc chắn:
 *   Pha 1: build 'dir' → dist/win-unpacked (có rcedit lỗi của electron-builder).
 *   Pha 2: DỰNG LẠI CamGuard.exe từ electron.exe gốc bằng rcedit chuẩn, rồi KÝ exe chính + helper.
 *   Pha 3: build 'nsis' với prepackaged=win-unpacked → KHÔNG đóng gói lại, KHÔNG rcedit lại,
 *          nên exe đã ký được giữ nguyên; ký nốt bộ cài qua hook afterAllArtifactBuild.
 *
 * Chứng chỉ: build/cert/camguard-codesign.pfx (xem scripts/gen-cert.ps1). Không có → vẫn
 * đóng gói nhưng KHÔNG ký.
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const pfx = path.join(root, 'build', 'cert', 'camguard-codesign.pfx')
const winUnpacked = path.join(root, 'dist', 'win-unpacked')
const signing = fs.existsSync(pfx)

// Không để CSC_* kích hoạt bước ký mặc định của electron-builder (dễ lỗi với exe Electron lớn).
delete process.env.CSC_LINK
delete process.env.CSC_KEY_PASSWORD
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'

function ensureSigntool() {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'ensure-wincodesign.ps1')],
    { stdio: 'inherit' }
  )
  if (r.status !== 0) {
    throw new Error('Không chuẩn bị được signtool (xem scripts/ensure-wincodesign.ps1).')
  }
}

async function main() {
  const builder = require('electron-builder')
  const { Platform } = builder

  if (signing) {
    console.log('[pack-win] Ký bằng build/cert/camguard-codesign.pfx')
    ensureSigntool()
  } else {
    console.log('[pack-win] Không có chứng chỉ → đóng gói KHÔNG ký (xem scripts/gen-cert.ps1)')
  }

  // Pha 1: chỉ dựng thư mục ứng dụng (chưa tạo bộ cài).
  console.log('[pack-win] Pha 1: build dir…')
  await builder.build({ targets: Platform.WINDOWS.createTarget('dir') })

  // Pha 2: dựng lại + ký exe chính và helper (chỉ khi có chứng chỉ).
  if (signing) {
    const { signFile } = require('../build/sign-file')
    const { rebuildStampedExe } = require('../build/stamp-exe')
    console.log('[pack-win] Pha 2: dựng lại + ký exe chính và helper…')
    rebuildStampedExe(winUnpacked, 'CamGuard.exe')
    signFile(path.join(winUnpacked, 'CamGuard.exe'))
    signFile(path.join(winUnpacked, 'resources', 'helper', 'camguard-helper-win.exe'))
  }

  // Pha 3: đóng gói NSIS từ thư mục đã chuẩn bị (không rcedit lại → giữ nguyên chữ ký).
  console.log('[pack-win] Pha 3: build nsis (prepackaged)…')
  const files = await builder.build({
    targets: Platform.WINDOWS.createTarget('nsis'),
    prepackaged: winUnpacked
  })
  console.log('[pack-win] Xong. File tạo ra:')
  for (const f of files) console.log('  ', f)
}

main().catch((err) => {
  console.error('[pack-win] Lỗi đóng gói:', err.stack || err.message)
  process.exit(1)
})
