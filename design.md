# CamGuard — Tài liệu thiết kế

> App desktop chạy ngầm, theo dõi camera của máy. Bất cứ khi nào **có ứng dụng nào bật camera** (đèn camera sáng), CamGuard lập tức hiện **popup lớn ở giữa màn hình**, nằm trên mọi cửa sổ khác, để người dùng biết.
> Chạy trên **Windows 10/11** và **macOS 13+** (Intel + Apple Silicon). Khởi động cùng hệ thống. Được đóng gói thành **bộ cài đặt như app bình thường**.

---

## 0. Chỉ dẫn cho Claude Code (đọc trước tiên)

Người dùng sẽ chỉ nói: **"dựa vào file design.md code hoàn chỉnh app cho tôi"**. Nghĩa là:

1. **Làm trọn từ đầu đến cuối**: thực hiện **tất cả** milestone M1 → M7 (mục 12) theo thứ tự, cho đến khi có **bộ cài đặt chạy được**. Không dừng sau một milestone để hỏi "có làm tiếp không".
2. **Tự quyết định chi tiết kỹ thuật** khi tài liệu không nói rõ: chọn phương án hợp lý nhất, ghi lại quyết định vào `DECISIONS.md`. Chỉ hỏi người dùng khi thực sự bị chặn, ví dụ thiếu công cụ không tự cài được.
3. **Tạo task list** theo milestone và cập nhật tiến độ khi làm.
4. **Kiểm tra máy trước khi code**: Node.js (LTS), npm, Git; trên Windows thêm .NET 8 SDK; trên macOS thêm Xcode Command Line Tools / Swift. Thiếu thì tự cài nếu có thể, không được thì báo người dùng **chính xác** cần cài gì và lệnh/link cài.
5. **Build được trên máy hiện tại**: máy Windows build ra `.exe` cài đặt, máy macOS build ra `.dmg`. Helper của nền tảng còn lại không build được trên máy này thì vẫn **viết đủ code** và đảm bảo GitHub Actions (`.github/workflows/build.yml`) build được cả hai.
6. **Tự kiểm tra sau mỗi milestone**:
   - Helper: chạy trên terminal, xác nhận in đúng JSON (`ready`, `state`, `heartbeat`).
   - App: `npm run dev` khởi động không lỗi, tray hiện, popup + nhạc hoạt động khi bật camera (dùng app Camera / Photo Booth hoặc trang webcam test để thử).
   - TypeScript build không lỗi (`tsc --noEmit`), lint sạch.
   - Viết unit test cho `cameraStateStore` (debounce, whitelist, tạm dừng) và parser của helper.
7. **Không bỏ tính năng** nào trong mục 1.2 (F1–F12). Phần nào không làm được hoàn toàn (vd gắn tên app trên macOS) thì làm theo fallback đã mô tả, rồi ghi rõ trong README.
8. **Tài nguyên**: tự tạo icon app, icon tray (3 trạng thái) và 3 file âm thanh báo động. Âm thanh có thể **tự sinh bằng script** (sóng sin/còi) ra `.wav`. Không tải tài nguyên có bản quyền.
9. **Kết thúc** bằng:
   - `README.md` tiếng Việt: yêu cầu hệ thống, cách chạy dev, cách build bộ cài, cách cài đặt (kể cả cách vượt cảnh báo SmartScreen / Gatekeeper khi chưa ký số), cách gỡ, giới hạn đã biết.
   - Đường dẫn tới file bộ cài đã build trong thư mục `dist/`.
   - Danh sách kịch bản test ở mục 13 kèm trạng thái: đã tự kiểm, hay cần người dùng kiểm trên máy thật.
10. Commit Git theo từng milestone với message rõ ràng.

---

## 1. Mục tiêu & phạm vi

### 1.1 Kịch bản chính (bắt buộc phải chạy đúng)
Người dùng đang mở một trang web học online trên Chrome/Edge, đồng thời đang code trong VSCode (VSCode đang ở foreground, có thể full-screen). Trang web tự gọi camera để quét khuôn mặt.
→ Trong vòng **≤ 2 giây**, CamGuard hiện popup ở giữa màn hình, **nằm đè lên VSCode**, ghi rõ: *"Google Chrome đang sử dụng camera"*, kèm thời điểm bắt đầu.

### 1.2 Yêu cầu chức năng
| # | Yêu cầu |
|---|---|
| F1 | Phát hiện khi **bất kỳ** app nào bắt đầu dùng camera (app thường, app Store, trình duyệt). |
| F2 | Phát hiện khi camera **ngừng** được dùng. |
| F3 | Khi camera bật → hiện popup lớn, giữa màn hình, always-on-top, kể cả trên app full-screen. |
| F4 | Popup hiển thị **tên app** đang dùng camera (nếu xác định được), thời điểm bắt đầu. |
| F5 | Khi camera tắt → popup chuyển trạng thái "Camera đã tắt" rồi tự đóng sau 3 giây (có thể cấu hình). |
| F6 | Tự khởi động cùng hệ thống (bật mặc định sau khi cài). |
| F7 | Chạy ngầm, chỉ có icon ở **system tray (Windows) / menu bar (macOS)**. Không có icon Dock trên macOS. |
| F8 | Menu tray: trạng thái hiện tại, Tạm dừng giám sát, Lịch sử, Cài đặt, Thoát. |
| F9 | Lịch sử: lưu 200 sự kiện gần nhất (app, bắt đầu, kết thúc, thời lượng). |
| F10 | Cài đặt: bật/tắt khởi động cùng máy, bật/tắt âm thanh cảnh báo, thời gian tự đóng popup, danh sách app bỏ qua (whitelist). |
| F11 | Chỉ chạy **một instance** duy nhất. |
| F12 | Khi camera bật → **phát nhạc báo động lặp liên tục, đủ to** để người không ngồi trước máy vẫn nghe thấy; tắt bằng nút trên popup hoặc khi camera tắt. |

### 1.3 Yêu cầu phi chức năng
- **Không bao giờ tự mở camera.** Chỉ hỏi/lắng nghe trạng thái từ hệ điều hành.
- Ưu tiên **cơ chế sự kiện** (event-driven), không polling dày. CPU khi nhàn rỗi ≈ 0%, RAM mục tiêu < 150 MB.
- Độ trễ từ lúc camera bật đến lúc popup hiện: **≤ 2 giây**.
- Không cần mạng, không gửi dữ liệu ra ngoài.

### 1.4 Ngoài phạm vi (không làm ở bản đầu)
- Xác định **tab** nào trong trình duyệt dùng camera (OS chỉ biết tiến trình trình duyệt).
- Chặn app dùng camera.
- Theo dõi microphone (có thể làm sau, kiến trúc nên để mở).
- Linux.

---

## 2. Kiến trúc tổng thể

```
┌────────────────────────── CamGuard (Electron, TypeScript) ──────────────────────────┐
│                                                                                     │
│  Main process                                                                       │
│   ├─ HelperManager   ── spawn + giám sát helper native, đọc JSON từ stdout          │
│   ├─ CameraStateStore── gộp sự kiện, debounce, áp whitelist                         │
│   ├─ AlertController ── tạo/cập nhật/đóng cửa sổ popup                              │
│   ├─ TrayController  ── icon + menu tray / menu bar                                 │
│   ├─ HistoryStore    ── lưu lịch sử (JSON file trong userData)                      │
│   ├─ SettingsStore   ── cài đặt (electron-store)                                    │
│   └─ AutoLaunch      ── app.setLoginItemSettings                                    │
│                                                                                     │
│  Renderer windows: alert (popup), history, settings  (HTML/TS + React hoặc vanilla) │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           │ stdout: JSON Lines   stdin: lệnh (tuỳ chọn)
                     ┌─────────────────────┴─────────────────────┐
                     │                                           │
        camguard-helper-win.exe                    camguard-helper-mac (Swift)
        (C# .NET 8, NativeAOT)                     CoreMediaIO + system log
        Registry CapabilityAccessManager
```

**Lý do tách helper native:** API phát hiện camera khác hoàn toàn giữa hai OS và cần ngôn ngữ native. Tách thành tiến trình con giao tiếp qua stdout giúp:
- Phần Electron/TypeScript dùng chung 100% cho hai nền tảng.
- Không phải build native Node addon (tránh lỗi ABI mỗi lần nâng Electron).
- Helper crash không kéo sập app chính; có thể test helper độc lập trên terminal.

### 2.1 Tech stack
| Phần | Công nghệ |
|---|---|
| App chính | Electron (bản stable mới nhất) + TypeScript + Vite (electron-vite) |
| UI cửa sổ | React + TypeScript (hoặc vanilla nếu muốn nhẹ) |
| Lưu trữ | `electron-store` cho cài đặt; file JSON cho lịch sử |
| Helper Windows | C# .NET 8, publish **NativeAOT** single-file (`win-x64`, `win-arm64`) |
| Helper macOS | Swift 5.9+, Swift Package Manager, build **universal** (arm64 + x86_64) |
| Đóng gói | `electron-builder` — Windows: **NSIS installer (.exe)**; macOS: **.dmg** (universal) |
| CI | GitHub Actions, matrix `windows-latest` + `macos-latest` |

---

## 3. Giao thức helper ↔ app chính

- Helper ghi ra **stdout**, mỗi dòng là một JSON object (JSON Lines, UTF-8).
- Log debug của helper ghi ra **stderr** (app chính ghi lại vào file log, không parse).
- Helper chạy mãi đến khi stdin đóng hoặc nhận lệnh `{"cmd":"quit"}`.

### 3.1 Sự kiện (helper → app)
```jsonc
// Helper khởi động xong, kèm trạng thái ban đầu
{"type":"ready","platform":"win32","version":"1.0.0"}

// Trạng thái camera thay đổi — LUÔN gửi danh sách ĐẦY ĐỦ các app đang dùng camera hiện tại
{"type":"state","inUse":true,"apps":[
  {"id":"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
   "name":"Google Chrome","since":"2026-10-19T09:55:12.000Z"}
],"devices":["Integrated Camera"]}

{"type":"state","inUse":false,"apps":[],"devices":[]}

// Lỗi không chí mạng
{"type":"error","code":"LOG_STREAM_FAILED","message":"..."}

// Nhịp sống mỗi 30s (để app chính biết helper còn sống)
{"type":"heartbeat"}
```

Quy tắc:
- Helper gửi `state` **ngay sau `ready`** (trạng thái ban đầu), sau đó mỗi khi danh sách app/trạng thái thay đổi.
- `apps` có thể rỗng trong khi `inUse:true` (macOS khi không xác định được app) → UI hiển thị "Một ứng dụng đang sử dụng camera".
- `name` là tên thân thiện (Windows: lấy `FileDescription` từ version info của exe, fallback tên file không đuôi; macOS: tên app từ bundle id).

### 3.2 Lệnh (app → helper, qua stdin, tuỳ chọn)
```json
{"cmd":"rescan"}
{"cmd":"quit"}
```

### 3.3 HelperManager (phía Electron)
- Đường dẫn helper: khi dev lấy từ `helpers/<platform>/bin`, khi đóng gói lấy từ `process.resourcesPath/helper/`.
- Nếu helper thoát bất thường → restart với backoff 1s, 2s, 5s, 10s, tối đa 30s. Sau 5 lần liên tiếp thất bại → hiện thông báo lỗi trên tray.
- Không nhận heartbeat > 90s → kill và restart helper.
- Khi app thoát → gửi `quit`, chờ 1s, rồi kill.

---

## 4. Helper Windows (`camguard-helper-win`)

### 4.1 Nguồn dữ liệu
Windows 10 (1903+) / 11 ghi lại việc sử dụng camera trong Registry của Capability Access Manager:

```
HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam\
    <PackageFamilyName>\                     ← app Store / packaged (Camera, Teams mới, ...)
        LastUsedTimeStart  (QWORD, FILETIME)
        LastUsedTimeStop   (QWORD, FILETIME)
    NonPackaged\
        C:#Program Files#Google#Chrome#Application#chrome.exe\   ← đường dẫn exe, '\' thay bằng '#'
            LastUsedTimeStart
            LastUsedTimeStop
```

Cũng quét nhánh tương ứng trong `HKLM\...\ConsentStore\webcam\` (một số app hệ thống/dịch vụ ghi ở đây).

**Quy tắc: một app ĐANG dùng camera khi `LastUsedTimeStop == 0` và `LastUsedTimeStart != 0`.**

### 4.2 Cơ chế lắng nghe
1. Lúc khởi động: quét toàn bộ cây `webcam` (HKCU + HKLM) → tính tập app đang dùng → gửi `ready` + `state`.
2. Gọi `RegNotifyChangeKeyValue` trên key `webcam` với `bWatchSubtree = TRUE`, filter `REG_NOTIFY_CHANGE_NAME | REG_NOTIFY_CHANGE_LAST_SET`, kiểu async với event handle. Mỗi lần event được báo → quét lại toàn bộ cây → so sánh với tập cũ → nếu khác thì gửi `state`. **Phải đăng ký lại notify sau mỗi lần nhận** (notify chỉ bắn một lần).
3. Dự phòng: quét lại mỗi 5 giây nhẹ nhàng, phòng trường hợp bỏ sót notify.
4. Debounce 300 ms giữa notify và quét (registry thường thay đổi nhiều giá trị liên tiếp).

### 4.3 Chuyển đổi tên
- `NonPackaged`: thay `#` → `\` để có đường dẫn exe; đọc `FileVersionInfo.FileDescription` (fallback `ProductName`, rồi tên file).
- Packaged: tên key là PackageFamilyName (vd `Microsoft.WindowsCamera_8wekyb3d8bbwe`) → hiển thị phần trước dấu `_`, bỏ tiền tố `Microsoft.` nếu có; có thể tra tên hiển thị qua `PackageManager` nếu khả thi, không bắt buộc.
- `since`: chuyển `LastUsedTimeStart` (FILETIME) sang ISO-8601 UTC.

### 4.4 Build
- `dotnet publish -c Release -r win-x64 -p:PublishAot=true` (và `win-arm64`).
- Output đặt vào `helpers/win/bin/camguard-helper-win.exe`.
- Không cần quyền admin. Không hiện cửa sổ console (app chính spawn với `windowsHide: true`).

### 4.5 Lưu ý
- Nếu người dùng tắt hẳn quyền camera trong Windows Privacy thì không có app nào dùng được camera → không cần báo.
- Camera ảo (OBS Virtual Camera) vẫn được ghi nhận nếu app dùng nó qua Windows camera stack — chấp nhận.

---

## 5. Helper macOS (`camguard-helper-mac`)

### 5.1 Phát hiện camera bật/tắt — CoreMediaIO (bắt buộc)
1. Cho phép xem thiết bị "screen capture/DAL" nếu cần (`kCMIOHardwarePropertyAllowScreenCaptureDevices`) — tuỳ chọn.
2. Lấy danh sách thiết bị: `kCMIOHardwarePropertyDevices` trên `kCMIOObjectSystemObject`.
3. Với mỗi thiết bị: đăng ký `CMIOObjectAddPropertyListenerBlock` cho `kCMIODevicePropertyDeviceIsRunningSomewhere`.
4. Đăng ký listener cho chính `kCMIOHardwarePropertyDevices` để xử lý cắm/rút camera ngoài (thêm/bỏ listener tương ứng).
5. `inUse = true` nếu **bất kỳ** thiết bị nào có `IsRunningSomewhere == 1`. `devices` = tên các thiết bị đó (`kCMIOObjectPropertyName`).
6. Chạy trong `RunLoop.main` / `dispatchMain()`.

Cơ chế này không cần xin quyền Camera (TCC), vì không mở camera.

### 5.2 Xác định app nào đang dùng camera — system log (best-effort)
macOS không có API công khai trả về tiến trình dùng camera. Cách làm:
- Chạy tiến trình con `log stream --style ndjson --predicate '<predicate>'`, parse từng dòng.
- Trên macOS 14+ Control Center ghi các dòng kiểu *"Active activity attributions changed to [...]"*, trong đó có các mục dạng `cam:<bundle-id>` (đây chính là dữ liệu của chấm xanh trên menu bar). Predicate gợi ý: `subsystem == "com.apple.controlcenter" AND eventMessage CONTAINS "attributions"`.
- Từ bundle id → tên app qua `NSWorkspace.shared.urlForApplication(withBundleIdentifier:)` + `FileManager.displayName`.
- **Claude Code cần kiểm chứng định dạng log thực tế** trên máy test (macOS 13, 14, 15+) và viết parser chịu lỗi. Tham khảo cách làm của tool mã nguồn mở **OverSight** (Objective-See).
- Nếu không parse được hoặc `log stream` lỗi → vẫn hoạt động đầy đủ với `apps: []` (UI hiển thị "Một ứng dụng đang sử dụng camera") và gửi một `error` code `ATTRIBUTION_UNAVAILABLE`.
- Kết hợp: trạng thái bật/tắt **luôn** lấy từ CoreMediaIO (nguồn tin cậy); log chỉ dùng để gắn tên app.

### 5.3 Build
- Swift Package, target executable, `swift build -c release --arch arm64 --arch x86_64` → binary universal.
- Output: `helpers/mac/bin/camguard-helper-mac`.
- Được ký cùng app khi đóng gói (electron-builder ký các binary trong resources khi có chứng chỉ).

---

## 6. Popup cảnh báo (AlertWindow)

### 6.1 Giao diện
- Kích thước: ~ **560 × 320 px** (scale theo DPI), bo góc, nền đỏ/cam đậm hoặc nền tối viền đỏ, chữ trắng lớn.
- Nội dung:
  - Icon camera lớn + chấm đỏ nhấp nháy.
  - Tiêu đề: **"CAMERA ĐANG ĐƯỢC SỬ DỤNG"**.
  - Dòng chính: **"Google Chrome đang sử dụng camera"** (nhiều app thì liệt kê từng dòng).
  - Phụ: "Bắt đầu lúc 16:55:12" + tên thiết bị camera.
  - Nút: **[Đã biết]** (đóng popup), **[Bỏ qua app này]** (thêm vào whitelist, có xác nhận).
- Khi camera tắt: đổi sang nền xanh, "Camera đã tắt", tự đóng sau `autoCloseSeconds` (mặc định 3s).
- **Nhạc/chuông báo động** khi popup hiện (xem mục 6.4). Mục đích là người dùng **không ngồi trước máy** (đi vệ sinh, đi lấy nước) vẫn nghe thấy.
- Ngôn ngữ giao diện: tiếng Việt (để chuỗi trong một file i18n để sau thêm tiếng Anh).

### 6.2 Hành vi cửa sổ (Electron)
- `BrowserWindow` với: `frame: false`, `resizable: false`, `skipTaskbar: true`, `alwaysOnTop: true`, `show: false`, `focusable` vẫn true nhưng hiển thị bằng **`showInactive()`** để **không cướp focus bàn phím** (người dùng đang gõ code không bị gõ nhầm).
- `win.setAlwaysOnTop(true, 'screen-saver')` — mức cao nhất.
- `win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` — macOS: hiện cả trên Space/app full-screen.
- macOS: `app.dock.hide()`; app dùng `LSUIElement` (agent app) để không có icon Dock.
- Vị trí: **giữa màn hình chứa con trỏ chuột** (`screen.getDisplayNearestPoint(screen.getCursorScreenPoint())`), dùng `workArea`.
- Chỉ có **một** popup tại một thời điểm; trạng thái mới thì cập nhật nội dung popup đang mở (gửi IPC), không tạo cửa sổ mới.
- Tạo sẵn cửa sổ ẩn khi khởi động (pre-warm) để popup hiện tức thì.

### 6.3 Logic hiển thị (CameraStateStore)
- Lọc bỏ các app nằm trong whitelist. Nếu sau khi lọc không còn app nào và `apps` ban đầu không rỗng → không hiện popup.
- Debounce **1 giây** cho chuyển bật→tắt (tránh nháy khi app bật/tắt camera liên tục); chuyển tắt→bật hiện ngay.
- Khi có app **mới** tham gia dùng camera trong lúc popup đã đóng bởi "Đã biết" → hiện lại popup.
- Khi giám sát đang **Tạm dừng** → vẫn ghi lịch sử, không hiện popup; icon tray đổi trạng thái.
- Trạng thái ban đầu lúc app khởi động mà camera đang bật → hiện popup luôn.

### 6.4 Nhạc báo động (bắt buộc)
Popup thôi chưa đủ, vì người dùng có thể không ở trước màn hình. Khi camera bật, app phải **phát nhạc báo động đủ to để nghe được từ phòng bên cạnh**.

- **Phát lặp liên tục** (loop) cho đến khi xảy ra một trong các điều kiện:
  - người dùng bấm **[Đã biết]** / **[Tắt chuông]** trên popup, hoặc
  - camera tắt, hoặc
  - hết `alarmMaxSeconds` (mặc định 120s, 0 = kêu mãi đến khi bấm tắt).
- Popup có nút **[Tắt chuông]** riêng: tắt nhạc nhưng giữ popup.
- Phát từ **renderer của popup** bằng `HTMLAudioElement` (`loop = true`, `volume = alarmVolume`). Đặt `backgroundThrottling: false` và cờ `autoplayPolicy: 'no-user-gesture-required'` cho cửa sổ popup để nhạc phát được dù popup không có focus.
- **Âm thanh có sẵn** trong `resources/sounds/`: ít nhất 3 lựa chọn (vd "Còi báo động", "Chuông", "Bíp gấp"). Dùng file tự tạo hoặc giấy phép CC0, **không dùng nhạc có bản quyền**. Người dùng có thể chọn **file nhạc riêng** (.mp3/.wav/.m4a) trong Cài đặt.
- Có nút **[Nghe thử]** trong Cài đặt.
- **Âm lượng hệ thống**: app chỉ chỉnh được âm lượng của chính nó (mặc định 100%). Nếu máy đang **tắt tiếng (mute) hoặc âm lượng hệ thống quá nhỏ**, app không ghi đè được một cách tin cậy trên cả hai OS. Vì vậy:
  - Khi khởi động và mỗi 10 phút, kiểm tra trạng thái mute/âm lượng hệ thống. Helper có thể báo thêm sự kiện `{"type":"audio","muted":true,"volume":0.1}`: Windows dùng Core Audio `IAudioEndpointVolume`, macOS dùng CoreAudio `kAudioDevicePropertyMute` / `kAudioHardwareServiceDeviceProperty_VirtualMainVolume`.
  - Nếu mute hoặc âm lượng < 30% → icon tray hiện cảnh báo vàng, tooltip "Âm thanh hệ thống đang tắt — bạn có thể không nghe được chuông báo".
  - Tuỳ chọn nâng cao `forceSystemVolume` (mặc định **tắt**): khi báo động, tạm unmute và nâng âm lượng hệ thống lên `alarmVolume`, tắt chuông xong thì trả lại mức cũ. Làm qua helper native.
- Nhạc vẫn kêu khi giám sát đang **Tạm dừng**? → **Không** (tạm dừng = không popup, không chuông, chỉ ghi lịch sử).
- Nếu người dùng đeo tai nghe Bluetooth, nhạc sẽ ra tai nghe (theo thiết bị output mặc định). Ghi chú trong phần Giới thiệu/FAQ.

---

## 7. Tray / Menu bar

- Icon 3 trạng thái: **bình thường** (xám), **camera đang bật** (đỏ), **tạm dừng** (gạch chéo). Có icon template (đen trắng) cho macOS menu bar, icon `.ico` cho Windows.
- Tooltip: "CamGuard — Camera đang tắt" / "CamGuard — Google Chrome đang dùng camera".
- Menu:
  - Trạng thái hiện tại (dòng disabled)
  - Tạm dừng giám sát ▸ 15 phút / 1 giờ / Cho đến khi bật lại
  - Lịch sử…
  - Cài đặt…
  - ─────
  - Giới thiệu (phiên bản)
  - Thoát CamGuard

## 8. Cài đặt & lịch sử

### 8.1 Settings (electron-store)
```ts
interface Settings {
  launchAtLogin: boolean;      // mặc định true
  alarmEnabled: boolean;       // mặc định true
  alarmSound: string;          // 'siren' | 'bell' | 'beep' | đường dẫn file riêng; mặc định 'siren'
  alarmVolume: number;         // 0..1, mặc định 1.0
  alarmMaxSeconds: number;     // mặc định 120, 0 = kêu đến khi bấm tắt
  forceSystemVolume: boolean;  // mặc định false
  autoCloseSeconds: number;    // mặc định 3, 0 = không tự đóng
  whitelist: string[];         // danh sách app id (đường dẫn exe hoặc bundle id / package name)
  firstRunDone: boolean;
}
```

### 8.2 History
- File `history.json` trong `app.getPath('userData')`, tối đa 200 bản ghi, ghi đè vòng.
- Bản ghi: `{ appId, appName, device, start, end, durationSec }`.
- Cửa sổ Lịch sử: bảng đơn giản, nút "Xoá lịch sử".

### 8.3 Log
- File log xoay vòng (`electron-log`) trong userData, ghi cả stderr của helper. Hữu ích khi debug trên máy thật.

---

## 9. Khởi động cùng hệ thống

- Dùng `app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true, args: ['--hidden'] })`.
  - macOS 13+: Electron dùng `SMAppService` (Login Items).
  - Windows: ghi vào `HKCU\...\Run`.
- Lần chạy đầu sau khi cài: bật mặc định, đặt `firstRunDone = true`, hiện thông báo nhỏ "CamGuard đang chạy ở khay hệ thống".
- Khi khởi động với `--hidden`: không mở cửa sổ nào, chỉ tray.
- Đồng bộ checkbox trong Cài đặt với `app.getLoginItemSettings()`.
- `app.requestSingleInstanceLock()`; instance thứ hai → mở cửa sổ Cài đặt của instance đang chạy rồi thoát.

---

## 10. Đóng gói & cài đặt (như app bình thường)

### 10.1 electron-builder
- `appId`: `com.camguard.app`, `productName`: `CamGuard`.
- `extraResources`: copy helper đúng nền tảng vào `resources/helper/`.
- **Windows**
  - Target: **NSIS** (`CamGuard-Setup-x.y.z.exe`), arch `x64` (+ `arm64` nếu build được).
  - `oneClick: false`, `allowToChangeInstallationDirectory: true`, `perMachine: false` (không cần admin).
  - Tạo shortcut Start Menu + Desktop, có trong "Apps & features" để gỡ cài đặt.
  - Khi gỡ: xoá khỏi danh sách khởi động, kill tiến trình đang chạy (NSIS `customUnInstall` / kiểm tra app đang chạy).
- **macOS**
  - Target: **dmg** universal (`CamGuard-x.y.z-universal.dmg`) + `zip` (cho auto-update sau này).
  - `extendInfo`: `LSUIElement: true`.
  - `hardenedRuntime: true`, entitlements tối thiểu (không cần camera entitlement vì không mở camera).
  - Kéo thả vào Applications như app bình thường.

### 10.2 Ký số
- **Không bắt buộc cho bản dùng cá nhân.** Khi chưa ký:
  - Windows: SmartScreen cảnh báo → "More info" → "Run anyway".
  - macOS: lần đầu mở bằng chuột phải → Open (hoặc System Settings → Privacy & Security → Open Anyway).
- Cấu hình sẵn biến môi trường cho ký số để bật sau: Windows (`CSC_LINK`, `CSC_KEY_PASSWORD`), macOS (Developer ID + notarize qua `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).

### 10.3 Scripts (package.json)
```
dev               chạy Electron dev + helper đã build sẵn
build:helper:win  dotnet publish NativeAOT → helpers/win/bin
build:helper:mac  swift build universal → helpers/mac/bin
build:win         build:helper:win + electron-vite build + electron-builder --win
build:mac         build:helper:mac + electron-vite build + electron-builder --mac
```
- Helper Windows phải build trên Windows, helper macOS phải build trên macOS → dùng **GitHub Actions matrix** để ra cả hai bộ cài, upload thành artifact/release.

---

## 11. Cấu trúc thư mục

```
camguard/
├─ package.json
├─ electron-builder.yml
├─ electron.vite.config.ts
├─ src/
│  ├─ main/
│  │  ├─ index.ts              # bootstrap, single instance, autostart
│  │  ├─ helperManager.ts
│  │  ├─ cameraStateStore.ts
│  │  ├─ alertController.ts
│  │  ├─ trayController.ts
│  │  ├─ historyStore.ts
│  │  ├─ settingsStore.ts
│  │  └─ protocol.ts           # type cho JSON events (dùng chung)
│  ├─ preload/
│  │  └─ index.ts              # contextBridge API an toàn cho renderer
│  └─ renderer/
│     ├─ alert/                # popup
│     ├─ history/
│     ├─ settings/
│     └─ i18n/vi.json
├─ helpers/
│  ├─ win/                     # C# .NET 8 project
│  │  ├─ CamGuardHelper.csproj
│  │  └─ Program.cs ...
│  └─ mac/                     # Swift package
│     ├─ Package.swift
│     └─ Sources/CamGuardHelper/...
├─ resources/icons/            # tray icons, app icon (.ico, .icns, template png)
└─ .github/workflows/build.yml
```

Bảo mật Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` cho renderer, chỉ expose các hàm cần thiết qua preload.

---

## 12. Lộ trình triển khai (milestones)

1. **M1 — Helper Windows**: chạy được trên terminal, in đúng JSON khi mở/tắt app Camera, Chrome (vd trang webcam test), Zoom.
2. **M2 — Helper macOS**: CoreMediaIO bật/tắt chính xác; sau đó thêm gắn tên app qua log (best-effort).
3. **M3 — Electron core**: HelperManager + CameraStateStore + tray; log sự kiện ra console.
4. **M4 — Popup**: AlertWindow đầy đủ hành vi (always-on-top, full-screen, không cướp focus, giữa màn hình chứa con trỏ).
5. **M5 — Settings, History, whitelist, tạm dừng, âm thanh.**
6. **M6 — Autostart + single instance.**
7. **M7 — Đóng gói**: NSIS + dmg, GitHub Actions ra hai bộ cài, test cài/gỡ trên máy sạch.

Mỗi milestone phải chạy được độc lập trước khi sang bước tiếp theo.

---

## 13. Kịch bản kiểm thử (acceptance)

| # | Kịch bản | Kết quả mong đợi |
|---|---|---|
| T1 | Mở app Camera của Windows / Photo Booth (mac) | Popup hiện ≤ 2s, đúng tên app |
| T2 | Đóng app đó | Popup chuyển "Camera đã tắt", tự đóng sau 3s; lịch sử có bản ghi với thời lượng |
| T3 | **VSCode full-screen đang gõ code, tab Chrome nền mở trang dùng webcam (vd webcamtests.com)** | Popup hiện đè lên VSCode, ghi "Google Chrome"; con trỏ vẫn gõ được trong VSCode (không mất focus) |
| T4 | Hai app cùng dùng camera (Chrome + Zoom) | Popup liệt kê cả hai; tắt một app → popup cập nhật còn một |
| T5 | Thêm Zoom vào whitelist, mở Zoom | Không hiện popup; vẫn có trong lịch sử |
| T6 | Khởi động lại máy | CamGuard tự chạy, chỉ hiện icon tray |
| T7 | Bật camera trước khi mở CamGuard | Mở CamGuard → popup hiện ngay |
| T8 | Kill tiến trình helper bằng Task Manager / Activity Monitor | Helper tự khởi động lại, giám sát tiếp tục |
| T9 | Cắm webcam USB rồi dùng nó (mac/win) | Vẫn phát hiện đúng |
| T10 | Nhiều màn hình | Popup hiện giữa màn hình đang có con trỏ chuột |
| T11 | Cài bằng bộ cài, gỡ qua Apps & features / kéo vào Thùng rác | Cài/gỡ sạch, không còn chạy khi khởi động |
| T12 | Chạy CamGuard lần hai | Không có instance thứ hai; mở cửa sổ Cài đặt |
| T13 | Bật camera rồi rời khỏi máy | Nhạc báo động kêu lặp liên tục, đủ to, đến khi bấm tắt / camera tắt / hết `alarmMaxSeconds` |
| T14 | Bấm [Tắt chuông] | Nhạc tắt ngay, popup vẫn còn |
| T15 | Máy đang mute | Icon tray cảnh báo vàng; nếu bật `forceSystemVolume` thì chuông vẫn kêu và trả lại mute sau khi tắt |
| T16 | Chọn file nhạc riêng + Nghe thử | Phát đúng file đã chọn |

---

## 14. Rủi ro & lưu ý cho người code

- **macOS gắn tên app** dựa vào định dạng log không chính thức, có thể đổi theo phiên bản OS → phải có fallback, không để lỗi parse làm hỏng phát hiện bật/tắt.
- **Windows registry** là cơ chế không có tài liệu chính thức đầy đủ nhưng ổn định từ Windows 10 1903 đến Windows 11; luôn giữ cơ chế quét dự phòng 5s.
- Một số **game/app full-screen exclusive** trên Windows có thể che popup → nhạc báo động là lớp dự phòng.
- Nhạc báo động phụ thuộc âm lượng hệ thống → luôn cảnh báo khi máy bị mute (mục 6.4).
- Trình duyệt chỉ được báo ở mức tiến trình (Chrome/Edge/Firefox), không biết tab.
- Không dùng bất kỳ API nào mở camera (kể cả để "kiểm tra") — sẽ làm đèn sáng và tự kích hoạt cảnh báo.
