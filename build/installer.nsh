; Tuỳ biến NSIS cho CamGuard.
; Đóng app (và helper) đang chạy trước khi cài/gỡ để ghi đè file được.

!macro customInit
  nsExec::Exec 'taskkill /F /IM CamGuard.exe /T'
  nsExec::Exec 'taskkill /F /IM camguard-helper-win.exe /T'
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /IM CamGuard.exe /T'
  nsExec::Exec 'taskkill /F /IM camguard-helper-win.exe /T'
!macroend

!macro customUnInstall
  ; Xoá khỏi danh sách khởi động cùng Windows (HKCU\...\Run)
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "CamGuard"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.camguard.app"
!macroend
