// Ký CamGuard.exe (và helper) ngay sau khi đóng gói, TRƯỚC khi NSIS gói lại.
const path = require('path')
const { signFile } = require('./sign-file')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const dir = context.appOutDir
  signFile(path.join(dir, 'CamGuard.exe'))
  // Helper nằm trong resources/helper/
  signFile(path.join(dir, 'resources', 'helper', 'camguard-helper-win.exe'))
}
