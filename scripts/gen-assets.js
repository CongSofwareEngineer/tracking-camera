#!/usr/bin/env node
/**
 * Tự sinh toàn bộ tài nguyên bằng code (không tải file có bản quyền):
 *   resources/icons/icon.png        (512x512, electron-builder tự tạo .ico/.icns từ đây)
 *   resources/icons/app.ico         (256x256, icon cửa sổ Windows)
 *   resources/icons/tray-normal.png (32x32, xám)
 *   resources/icons/tray-active.png (32x32, đỏ)
 *   resources/icons/tray-paused.png (32x32, gạch chéo)
 *   resources/sounds/siren.wav      (còi hú quét tần số)
 *   resources/sounds/bell.wav       (chuông ngân)
 *   resources/sounds/beep.wav       (bíp gấp)
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ICONS = path.join(__dirname, '..', 'resources', 'icons')
const SOUNDS = path.join(__dirname, '..', 'resources', 'sounds')
fs.mkdirSync(ICONS, { recursive: true })
fs.mkdirSync(SOUNDS, { recursive: true })

// ---------------- PNG encoder (RGBA, pure JS) ----------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// vẽ bằng callback (x,y)->[r,g,b,a]
function draw(width, height, fn) {
  const buf = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fn(x, y)
      const i = (y * width + x) * 4
      buf[i] = r
      buf[i + 1] = g
      buf[i + 2] = b
      buf[i + 3] = a
    }
  }
  return buf
}

// Icon camera đơn giản: thân máy bo góc + ống kính tròn, màu tuỳ trạng thái
function cameraIcon(size, body, lens, dot) {
  const cx = size / 2
  const cy = size * 0.54
  const r = size * 0.22
  const bodyX0 = size * 0.14
  const bodyX1 = size * 0.86
  const bodyY0 = size * 0.32
  const bodyY1 = size * 0.78
  const corner = size * 0.08
  return draw(size, size, (x, y) => {
    const inBody = inRoundRect(x, y, bodyX0, bodyY0, bodyX1, bodyY1, corner)
    // bướu ngắm phía trên thân máy
    const inBump = x >= size * 0.3 && x <= size * 0.5 && y >= size * 0.24 && y <= bodyY0 + 1
    const d = Math.hypot(x - cx, y - cy)
    if (d <= r * 0.5) return lens.inner
    if (d <= r) return lens.ring
    if (inBody || inBump) return body
    // chấm trạng thái góc trên phải
    if (dot && Math.hypot(x - size * 0.74, y - size * 0.42) <= size * 0.05) return dot
    return [0, 0, 0, 0]
  })
}
// Điểm (x,y) có nằm trong hình chữ nhật bo góc bán kính r không?
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  // bốn góc
  if (x < x0 + r && y < y0 + r) return Math.hypot(x - (x0 + r), y - (y0 + r)) <= r
  if (x > x1 - r && y < y0 + r) return Math.hypot(x - (x1 - r), y - (y0 + r)) <= r
  if (x < x0 + r && y > y1 - r) return Math.hypot(x - (x0 + r), y - (y1 - r)) <= r
  if (x > x1 - r && y > y1 - r) return Math.hypot(x - (x1 - r), y - (y1 - r)) <= r
  return true
}

function writePNG(file, size, body, lens, dot) {
  const rgba = cameraIcon(size, body, lens, dot)
  fs.writeFileSync(file, encodePNG(size, size, rgba))
}

// Tray + app icons
const grayBody = [120, 124, 130, 255]
const redBody = [220, 50, 42, 255]
const grayLens = { ring: [80, 84, 90, 255], inner: [40, 42, 46, 255] }
const redLens = { ring: [150, 24, 20, 255], inner: [60, 10, 8, 255] }

writePNG(path.join(ICONS, 'tray-normal.png'), 32, grayBody, grayLens, null)
writePNG(path.join(ICONS, 'tray-active.png'), 32, redBody, redLens, [255, 59, 48, 255])
// paused: xám + gạch chéo
{
  const size = 32
  const base = cameraIcon(size, grayBody, grayLens, null)
  const withSlash = Buffer.from(base)
  for (let i = -2; i <= 2; i++) {
    for (let x = 4; x < size - 4; x++) {
      const y = x + i
      if (y >= 0 && y < size) {
        const idx = (y * size + x) * 4
        withSlash[idx] = 255
        withSlash[idx + 1] = 180
        withSlash[idx + 2] = 0
        withSlash[idx + 3] = 255
      }
    }
  }
  fs.writeFileSync(path.join(ICONS, 'tray-paused.png'), encodePNG(size, size, withSlash))
}

// App icon lớn 512 (builder tạo ico/icns từ đây)
writePNG(path.join(ICONS, 'icon.png'), 512, redBody, redLens, [255, 59, 48, 255])

// app.ico (ICO bọc PNG 256x256)
{
  const size = 256
  const png = encodePNG(size, size, cameraIcon(size, redBody, redLens, [255, 59, 48, 255]))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type icon
  header.writeUInt16LE(1, 4) // count
  const entry = Buffer.alloc(16)
  entry[0] = 0 // 256
  entry[1] = 0 // 256
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(6 + 16, 12) // offset
  fs.writeFileSync(path.join(ICONS, 'app.ico'), Buffer.concat([header, entry, png]))
}

// ---------------- WAV generator ----------------
const SR = 44100
function writeWAV(file, samples) {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]))
    data.writeInt16LE((s * 32767) | 0, i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SR, 24)
  header.writeUInt32LE(SR * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  fs.writeFileSync(file, Buffer.concat([header, data]))
}

// Còi hú: tần số quét 600<->1200 Hz, lặp mượt (loop-friendly)
{
  const dur = 2.0
  const n = Math.floor(SR * dur)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const tt = i / SR
    const f = 900 + 300 * Math.sin(2 * Math.PI * (tt / dur))
    phase += (2 * Math.PI * f) / SR
    out[i] = 0.85 * Math.sin(phase)
  }
  writeWAV(path.join(SOUNDS, 'siren.wav'), out)
}

// Chuông: hợp âm ngân rã, lặp mỗi 1.2s
{
  const dur = 2.4
  const n = Math.floor(SR * dur)
  const out = new Float32Array(n)
  const parts = [880, 1320, 1760]
  for (let i = 0; i < n; i++) {
    const tt = i / SR
    const local = tt % 1.2
    const env = Math.exp(-local * 3.5)
    let s = 0
    for (const f of parts) s += Math.sin(2 * Math.PI * f * tt)
    out[i] = 0.5 * env * (s / parts.length)
  }
  writeWAV(path.join(SOUNDS, 'bell.wav'), out)
}

// Bíp gấp: 1000Hz, bật/tắt nhanh
{
  const dur = 1.0
  const n = Math.floor(SR * dur)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const tt = i / SR
    const on = tt % 0.25 < 0.12
    out[i] = on ? 0.8 * Math.sin(2 * Math.PI * 1000 * tt) : 0
  }
  writeWAV(path.join(SOUNDS, 'beep.wav'), out)
}

console.log('[assets] đã sinh icon + âm thanh vào resources/')
