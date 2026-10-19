# Quyết định kỹ thuật (DECISIONS)

Ghi lại các lựa chọn khi design.md không quy định rõ, hoặc khi môi trường build buộc phải đổi phương án.

## D1 — Helper Windows: self-contained single-file thay vì NativeAOT (mặc định)
- **design.md** đề xuất NativeAOT (`PublishAot=true`).
- **Máy build hiện tại thiếu MSVC C++ build tools**, mà NativeAOT bắt buộc có MSVC để link.
- **Quyết định**: mặc định publish **self-contained single-file** (`PublishSingleFile=true`, `--self-contained`), không cần MSVC, vẫn ra một `.exe` chạy độc lập (không cần cài .NET). Giữ nguyên khả năng AOT: đặt `USE_AOT=1` khi có MSVC.
- **Hệ quả**: `.exe` lớn hơn (~35 MB) nhưng chạy đúng, không phụ thuộc runtime. Chấp nhận cho app desktop.

## D2 — UI: React + Vite (electron-vite)
- design.md cho chọn React hoặc vanilla. Chọn **React** vì popup cần cập nhật nội dung động qua IPC và quản lý trạng thái chuông; code rõ ràng hơn.

## D3 — Phát âm thanh chuông: truyền data URL
- Renderer bật `sandbox: true`. Nạp `file://` tuỳ tiện dễ bị chặn bởi webSecurity.
- **Quyết định**: main đọc file âm thanh (built-in hoặc file riêng của người dùng) rồi truyền **data URL base64** cho renderer. `HTMLAudioElement` loop phát được, không vướng bảo mật, hoạt động cả khi popup không có focus (`backgroundThrottling:false`, `autoplayPolicy:'no-user-gesture-required'`).

## D4 — electron-store v8 (không v10)
- v10 là ESM-only, gây phiền với bundle CJS của main. Dùng **v8** (ổn định, tương thích require) cho nhanh gọn.

## D5 — Tài nguyên sinh tự động
- Icon (PNG/ICO) và 3 file âm thanh WAV được **sinh bằng `scripts/gen-assets.js`** (không phụ thuộc thư viện ngoài, không tải tài nguyên bản quyền). Vì vậy `resources/icons` và `resources/sounds` nằm trong `.gitignore`; chạy `npm run gen:assets` để tạo lại. electron-builder tự tạo `.icns`/`.ico` từ `icon.png` khi cần.

## D6 — Tên thiết bị camera (Windows)
- design.md gợi ý lấy tên thiết bị. Lấy `FriendlyName` từ `DeviceClasses` (GUID camera) — best-effort; lỗi thì để `devices: []`, không ảnh hưởng phát hiện.

## D7 — Tự tăng version mỗi lần build
- `scripts/bump-version.js` tăng **patch** trong `package.json` mỗi khi chạy `npm run build:win` / `build:mac`.
- Có thể đổi: `BUMP=minor` / `BUMP=major` / `BUMP=none`.
- CI dùng `ci:build:*` (không bump) để giữ version theo tag/commit.

## D8 — Ký số local bằng chứng chỉ tự ký
- Để mang app sang laptop khác mà không bị SmartScreen chặn ("Windows protected your PC / Run anyway"):
  - `scripts/gen-cert.ps1` tạo chứng chỉ **code signing tự ký** (`build/cert/*.pfx` + `*.cer`).
  - `npm run build:win` **tự ký** bộ cài bằng pfx này (qua `scripts/pack-win.js`).
  - Trên laptop đích, chạy `scripts/trust-cert.ps1` (Admin) **một lần** để import `.cer` vào Trusted Root + Trusted Publishers → Windows tin cậy, hết cảnh báo.
- Lưu ý: chứng chỉ tự ký chỉ được tin trên các máy đã import `.cer`. Để phân phối rộng cần chứng chỉ EV/OV thương mại (cấu hình sẵn qua `CSC_LINK`).

## D9 — Audio mute/volume trong helper
- Helper Windows đọc mute/âm lượng qua Core Audio COM (`IAudioEndpointVolume`), helper macOS qua CoreAudio. Mọi lỗi được nuốt (best-effort) để không ảnh hưởng chức năng chính. Khi mute hoặc < 30% → tray cảnh báo vàng.

## D10 — macOS gắn tên app
- Dùng `log stream` của Control Center (không chính thức) để lấy `cam:<bundle-id>`. Parser chịu lỗi; nếu không parse được vẫn chạy đủ với `apps: []` và phát `error ATTRIBUTION_UNAVAILABLE`. Trạng thái bật/tắt **luôn** lấy từ CoreMediaIO.
