#!/usr/bin/env node
/**
 * Đóng gói Windows bằng electron-builder (API lập trình), TỰ ĐỘNG ký nếu có
 * chứng chỉ ở build/cert/. Dùng API thay vì spawn .cmd để tránh lỗi trên Node 20.
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const pfx = path.join(root, 'build', 'cert', 'camguard-codesign.pfx')

if (fs.existsSync(pfx)) {
  console.log('[pack-win] Sẽ ký bằng build/cert/camguard-codesign.pfx (qua build/after-pack.js)')
} else {
  console.log('[pack-win] Không có chứng chỉ → đóng gói KHÔNG ký (xem scripts/gen-cert.ps1)')
}
// Không để CSC_* kích hoạt bước ký mặc định (dễ lỗi) — ký qua hook win.sign (build/sign.js).
delete process.env.CSC_LINK
delete process.env.CSC_KEY_PASSWORD

const builder = require('electron-builder')
const { Platform } = builder

builder
  .build({ targets: Platform.WINDOWS.createTarget() })
  .then((files) => {
    console.log('[pack-win] Xong. File tạo ra:')
    for (const f of files) console.log('  ', f)
  })
  .catch((err) => {
    console.error('[pack-win] Lỗi đóng gói:', err)
    process.exit(1)
  })
