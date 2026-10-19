# CamGuard

App desktop chạy ngầm. Bất cứ khi nào **có ứng dụng bật camera của máy**, CamGuard lập tức hiện **popup lớn giữa màn hình** (đè lên mọi cửa sổ, kể cả full-screen) và **phát chuông báo động** đủ to để bạn nghe thấy kể cả khi không ngồi trước máy.

- Windows 10 (1903+) / 11 và macOS 13+ (Intel + Apple Silicon).
- Chạy ngầm ở **khay hệ thống** (Windows) / **menu bar** (macOS), tự khởi động cùng máy.
- **Không bao giờ tự mở camera** — chỉ lắng nghe trạng thái từ hệ điều hành.

> Chi tiết thiết kế: [design.md](design.md). Các quyết định kỹ thuật: [DECISIONS.md](DECISIONS.md).

---

## 1. Yêu cầu hệ thống để phát triển / build

| Công cụ | Dùng để |
|---|---|
| Node.js 18+ (khuyến nghị 20 LTS) + npm | App Electron |
| Git | quản lý mã |
| **.NET 8 SDK** (chỉ Windows) | build helper Windows (`dotnet`) |
| **Xcode Command Line Tools / Swift 5.9+** (chỉ macOS) | build helper macOS |

> Helper Windows chỉ build được trên Windows; helper macOS chỉ build được trên macOS. Để ra **cả hai** bộ cài, dùng GitHub Actions (xem mục 6).

Cài .NET 8 SDK trên Windows nếu thiếu:
```powershell
winget install Microsoft.DotNet.SDK.8
```

---

## 2. Chạy ở chế độ phát triển (dev)

```bash
npm install
npm run gen:assets          # sinh icon + 3 file âm thanh (.wav) vào resources/
npm run build:helper:win    # (Windows) build helper → helpers/win/bin/
# hoặc: npm run build:helper:mac   # (macOS)
npm run dev                 # chạy Electron + helper
```

Thử nghiệm: mở **app Camera** của Windows / **Photo Booth** trên macOS, hoặc mở trang <https://webcamtests.com> trong Chrome → popup phải hiện trong ≤ 2 giây kèm chuông.

Kiểm tra chất lượng mã:
```bash
npm run typecheck     # tsc --noEmit (main + renderer)
npm run lint
npm test              # unit test cho cameraStateStore + parser helper
```

---

## 3. Build bộ cài

> **Mỗi lần build, version tự động tăng** (patch) trong `package.json`. Đổi mức tăng: `BUMP=minor` / `BUMP=major` / `BUMP=none` trước lệnh build.

**Windows** (ra `dist/CamGuard-Setup-x.y.z.exe`):
```bash
npm run build:win
```

**macOS** (ra `dist/CamGuard-x.y.z-universal.dmg`):
```bash
npm run build:mac
```

---

## 4. Ký số local để không bị cảnh báo khi mang sang máy khác

Khi bộ cài **chưa ký**, Windows hiện SmartScreen *"Windows protected your PC"* và bạn phải bấm *More info → Run anyway*. CamGuard có sẵn cơ chế **ký bằng chứng chỉ tự ký local** để tránh điều đó trên các máy của bạn.

### Trên máy build (làm một lần)
```powershell
npm run gen:cert
```
Lệnh này tạo trong `build/cert/`:
- `camguard-codesign.pfx` + `password.txt` — dùng để **ký** (máy build giữ, đã `.gitignore`).
- `camguard-codesign.cer` — chứng chỉ **công khai** để mang sang máy khác.

Từ đó, **mỗi lần `npm run build:win` sẽ tự động ký** bộ cài bằng chứng chỉ này.

### Trên laptop đích (làm một lần cho mỗi máy)
Copy `camguard-codesign.cer` sang laptop, rồi mở **PowerShell quyền Administrator**:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/trust-cert.ps1
# hoặc trỏ tới file: ... -CerPath D:\duong-dan\camguard-codesign.cer
```
Script import chứng chỉ vào **Trusted Root** + **Trusted Publishers**. Sau đó bộ cài CamGuard đã ký được Windows tin cậy → **không còn cảnh báo SmartScreen "Run anyway"**.

> Lưu ý: chứng chỉ tự ký chỉ được tin trên các máy đã import `.cer`. Để phân phối rộng rãi (không cần import tay), cần chứng chỉ **EV/OV thương mại** — khi có, đặt biến môi trường `CSC_LINK` (đường dẫn .pfx) và `CSC_KEY_PASSWORD` rồi build như thường.

### macOS (Gatekeeper)
Bản chưa ký: lần đầu mở bằng **chuột phải → Open**, hoặc **System Settings → Privacy & Security → Open Anyway**. Để ký + notarize thật, đặt `CSC_LINK`/`CSC_KEY_PASSWORD` (Developer ID) và `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`.

---

## 5. Cài đặt & gỡ

- **Windows**: chạy `CamGuard-Setup-x.y.z.exe` → chọn thư mục → cài (không cần quyền admin). Có shortcut Start Menu + Desktop. App tự chạy ngầm ở khay hệ thống và bật khởi động cùng máy.
  Gỡ: **Settings → Apps → CamGuard → Uninstall** (tự tắt tiến trình đang chạy và xoá khỏi danh sách khởi động).
- **macOS**: mở `.dmg`, kéo **CamGuard** vào **Applications**. App không có icon Dock (chỉ ở menu bar).
  Gỡ: kéo **CamGuard** vào Thùng rác.

---

## 6. Build cả hai nền tảng bằng GitHub Actions

Workflow [.github/workflows/build.yml](.github/workflows/build.yml) chạy matrix `windows-latest` + `macos-latest`: cài .NET/Swift, build helper, build app, chạy test, đóng gói, rồi **upload bộ cài thành artifact**. Đẩy tag `v*` để build theo phiên bản.

---

## 7. Giới hạn đã biết

- **Trình duyệt chỉ báo ở mức tiến trình** (Chrome/Edge/Firefox) — không biết tab nào dùng camera (giới hạn của OS).
- **macOS gắn tên app** dựa vào log Control Center (không chính thức) → có thể không ra tên trên vài phiên bản; khi đó popup ghi "Một ứng dụng đang sử dụng camera". Việc **phát hiện bật/tắt luôn chính xác** vì lấy từ CoreMediaIO.
- **Game/app full-screen exclusive** (Windows) có thể che popup → chuông báo là lớp dự phòng.
- Chuông phát ra **thiết bị âm thanh mặc định** (kể cả tai nghe Bluetooth). Nếu máy **mute / âm lượng < 30%**, icon tray cảnh báo vàng; bật `forceSystemVolume` (nâng cao) để ép mở tiếng khi báo động.
- Chứng chỉ tự ký không có "uy tín" toàn cầu với SmartScreen; chỉ hết cảnh báo trên máy đã import `.cer` (mục 4).

---

## 8. Kịch bản kiểm thử (acceptance)

| # | Kịch bản | Trạng thái |
|---|---|---|
| T1 | Mở app Camera (Win) / Photo Booth (mac) → popup ≤ 2s đúng tên | ⏳ cần kiểm trên máy thật (mở camera) |
| T2 | Đóng app → "Camera đã tắt", tự đóng 3s; lịch sử có thời lượng | ⏳ cần kiểm trên máy thật |
| T3 | VSCode full-screen + Chrome nền dùng webcam → popup đè, không mất focus | ⏳ cần kiểm trên máy thật |
| T4 | Hai app cùng dùng camera → liệt kê cả hai, tắt một thì cập nhật | ⏳ cần kiểm trên máy thật |
| T5 | Whitelist Zoom → không popup, vẫn vào lịch sử | ✅ logic có unit test |
| T6 | Khởi động lại máy → tự chạy, chỉ icon tray | ⏳ cần kiểm trên máy thật |
| T7 | Bật camera trước khi mở CamGuard → mở lên popup ngay | ✅ logic có unit test (trạng thái ban đầu) |
| T8 | Kill helper → tự khởi động lại | ✅ đã tự kiểm (thấy backoff restart trong log) |
| T9 | Webcam USB | ⏳ cần kiểm trên máy thật |
| T10 | Nhiều màn hình → popup ở màn hình có con trỏ | ⏳ cần kiểm trên máy thật |
| T11 | Cài/gỡ sạch | ⏳ cần kiểm trên máy thật |
| T12 | Chạy lần hai → không có instance thứ hai, mở Cài đặt | ✅ `requestSingleInstanceLock` |
| T13 | Rời máy khi camera bật → chuông kêu lặp đến khi tắt/hết giờ | ⏳ cần kiểm trên máy thật |
| T14 | Bấm [Tắt chuông] → tắt nhạc, popup còn | ✅ logic renderer |
| T15 | Máy mute → tray cảnh báo vàng | ✅ helper phát event `audio` (đã thấy khi chạy) |
| T16 | Chọn file nhạc riêng + Nghe thử | ✅ có trong Cài đặt |

Đã tự kiểm trên máy build (Windows): helper in đúng JSON (`ready`/`state`/`audio`); app Electron khởi động, spawn + giám sát + tự restart helper; typecheck sạch; 14 unit test pass; đóng gói ra `.exe`.

---

## 9. Cấu trúc mã

Xem [design.md](design.md) mục 11. Tóm tắt: `src/main` (tiến trình chính), `src/preload` (cầu nối an toàn), `src/renderer/{alert,history,settings}` (giao diện), `helpers/win` (C# .NET 8), `helpers/mac` (Swift), `scripts/` (sinh tài nguyên, bump version, chứng chỉ).
