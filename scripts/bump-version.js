#!/usr/bin/env node
/**
 * Tự tăng version mỗi lần build.
 *
 * Mặc định tăng PATCH: 1.0.0 -> 1.0.1 -> 1.0.2 ...
 * Có thể đổi phần tăng qua biến môi trường BUMP=major|minor|patch (mặc định patch).
 * Bỏ qua bằng BUMP=none (vd khi CI muốn giữ nguyên version của tag).
 *
 * Ghi version mới vào package.json và in ra để các bước build sau dùng.
 */
const fs = require('fs')
const path = require('path')

const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

const part = (process.env.BUMP || 'patch').toLowerCase()
if (part === 'none') {
  console.log(`[bump] giữ nguyên version ${pkg.version}`)
  process.exit(0)
}

const m = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(pkg.version || '0.0.0')
if (!m) {
  console.error(`[bump] version không hợp lệ: ${pkg.version}`)
  process.exit(1)
}

let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])]
switch (part) {
  case 'major':
    major++
    minor = 0
    patch = 0
    break
  case 'minor':
    minor++
    patch = 0
    break
  case 'patch':
  default:
    patch++
    break
}

const next = `${major}.${minor}.${patch}`
pkg.version = next
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
console.log(`[bump] version mới: ${next}`)
