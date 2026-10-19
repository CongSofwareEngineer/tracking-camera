#!/usr/bin/env node
/**
 * Đóng gói Windows bằng electron-builder (API lập trình), TỰ ĐỘNG ký nếu có
 * chứng chỉ ở build/cert/. Dùng API thay vì spawn .cmd để tránh lỗi trên Node 20.
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const pfx = path.join(root, 'build', 'cert', 'camguard-codesign.pfx')
const pwdFile = path.join(root, 'build', 'cert', 'password.txt')

if (fs.existsSync(pfx) && fs.existsSync(pwdFile)) {
  process.env.CSC_LINK = 'file://' + pfx.replace(/\\/g, '/')
  process.env.CSC_KEY_PASSWORD = fs.readFileSync(pwdFile, 'utf-8').trim()
  console.log('[pack-win] Ký số bằng chứng chỉ build/cert/camguard-codesign.pfx')
} else if (process.env.CSC_LINK) {
  console.log('[pack-win] Ký số bằng CSC_LINK từ môi trường')
} else {
  console.log('[pack-win] Không có chứng chỉ → đóng gói KHÔNG ký (xem scripts/gen-cert.ps1)')
}

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
