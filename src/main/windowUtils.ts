import { app } from 'electron'
import path from 'path'

export type RendererPage = 'alert' | 'history' | 'settings'

/**
 * Trả về URL (dev) hoặc đường dẫn file (prod) của một trang renderer.
 * Dev: dùng ELECTRON_RENDERER_URL do electron-vite cung cấp.
 */
export function rendererUrl(page: RendererPage): string {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    return `${devUrl}/${page}/index.html`
  }
  return path.join(__dirname, '..', 'renderer', page, 'index.html')
}

export function preloadPath(): string {
  return path.join(__dirname, '..', 'preload', 'index.js')
}

export function iconPath(file: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icons', file)
    : path.join(app.getAppPath(), 'resources', 'icons', file)
}
