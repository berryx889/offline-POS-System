; Tauri's default NSIS template only creates a Start Menu shortcut, not a
; Desktop one — there's no JSON config field for it (checked the v2 schema),
; so it has to be added via this installerHooks script instead.
!macro NSIS_HOOK_POSTINSTALL
  CreateShortcut "$DESKTOP\CounterTop POS.lnk" "$INSTDIR\countertop-pos.exe"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$DESKTOP\CounterTop POS.lnk"
!macroend
