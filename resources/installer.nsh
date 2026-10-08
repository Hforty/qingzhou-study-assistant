!macro customInstall
  ; Chromium's sandbox must be able to read the installed public program files,
  ; including when the user chooses a folder with package-specific inherited ACLs.
  ; Study data lives separately in APPDATA and is not changed by this grant.
  Push $0
  Push $1
  nsExec::ExecToStack '"$SYSDIR\icacls.exe" "$INSTDIR" /grant "*S-1-15-2-1:(OI)(CI)(RX)"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    DetailPrint "Windows could not adjust sandbox read access for this directory."
  ${EndIf}
  Pop $1
  Pop $0
!macroend

!ifdef BUILD_UNINSTALLER
  !include "nsDialogs.nsh"
  !include "LogicLib.nsh"
  !include "FileFunc.nsh"
  !if "${APP_ID}" == "cn.qingzhou.study.verification.v105"
    !define QZ_STUDY_DIR "QingzhouStudy-Verification-v105"
    !define QZ_CACHE_DIR "qingzhou-study-verification-v105-updater"
  !else
    !define QZ_STUDY_DIR "QingzhouStudy"
    !define QZ_CACHE_DIR "qingzhou-study-updater"
  !endif
  Var QzClearData
  Var QzClearCheckbox
  Var QzDataPath
  Var QzCachePath
  Var QzCleanupSummary

!endif

!macro customHeader
!ifdef BUILD_UNINSTALLER
  Function un.QzWelcome
    ${If} ${Silent}
      Abort
    ${EndIf}
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "卸载轻舟学习助手" "请选择是否保留本机学习记录。"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 4u 100% 34u "卸载会移除程序与快捷方式。默认保留学习记录，重装后可继续使用。"
    Pop $0
    ${NSD_CreateCheckbox} 0 48u 100% 24u "同时清除本机学习记录、设置和缓存"
    Pop $QzClearCheckbox
    ${NSD_SetState} $QzClearCheckbox $QzClearData
    ${NSD_CreateLabel} 0 82u 100% 44u "勾选后会删除本机任务、进度、笔记和专注记录，无法恢复。数据目录之外的备份、独立安装包和源码不会删除。"
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function un.QzWelcomeLeave
    ${NSD_GetState} $QzClearCheckbox $QzClearData
  FunctionEnd

  ; Recursively reject reparse points before RMDir; never follow a link outside the roots.
  Function un.QzTreeSafe
    Exch $0
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    StrCpy $3 1
    System::Call 'kernel32::GetFileAttributesW(w "$0") i.r4 ?e'
    Pop $5
    ${If} $4 == -1
      ${If} $5 != 2
      ${AndIf} $5 != 3
        StrCpy $3 0
      ${EndIf}
      Goto qz_tree_done
    ${EndIf}
    IntOp $5 $4 & 0x400
    ${If} $5 != 0
      StrCpy $3 0
      Goto qz_tree_done
    ${EndIf}
    IntOp $5 $4 & 0x10
    ${If} $5 == 0
      StrCpy $3 0
      Goto qz_tree_done
    ${EndIf}
    ClearErrors
    FindFirst $1 $2 "$0\*"
    ${If} ${Errors}
      StrCpy $3 0
      Goto qz_tree_done
    ${EndIf}
    qz_tree_loop:
      StrCmp $2 "" qz_tree_close
      StrCmp $2 "." qz_tree_next
      StrCmp $2 ".." qz_tree_next
      System::Call 'kernel32::GetFileAttributesW(w "$0\$2") i.r4'
      ${If} $4 == -1
        StrCpy $3 0
        Goto qz_tree_close
      ${EndIf}
      IntOp $5 $4 & 0x400
      ${If} $5 != 0
        StrCpy $3 0
        Goto qz_tree_close
      ${EndIf}
      IntOp $5 $4 & 0x10
      ${If} $5 != 0
        Push "$0\$2"
        Call un.QzTreeSafe
        Pop $4
        ${If} $4 != 1
          StrCpy $3 0
          Goto qz_tree_close
        ${EndIf}
      ${EndIf}
    qz_tree_next:
      FindNext $1 $2
      Goto qz_tree_loop
    qz_tree_close:
      FindClose $1
    qz_tree_done:
      StrCpy $0 $3
      Pop $5
      Pop $4
      Pop $3
      Pop $2
      Pop $1
      Exch $0
  FunctionEnd

  Function un.QzCleanOne
    Exch $0
    Push $1
    Push $2
    qz_cleanup_retry:
      Push $0
      Call un.QzTreeSafe
      Pop $1
      ${If} $1 == 1
        ClearErrors
        RMDir /r "$0"
        System::Call 'kernel32::GetFileAttributesW(w "$0") i.r1 ?e'
        Pop $2
        ${If} $1 == -1
          ${If} $2 == 2
          ${OrIf} $2 == 3
            Goto qz_cleanup_done
          ${EndIf}
        ${EndIf}
      ${EndIf}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "未能安全清理以下目录：$\r$\n$0$\r$\n$\r$\n请关闭占用文件的程序后点击“重试”。点击“取消”将继续卸载，并保留此处尚未清理的文件。异常链接不会被递归删除。" IDRETRY qz_cleanup_retry
      StrCpy $QzCleanupSummary "$QzCleanupSummary$\r$\n未清理：$0"
    qz_cleanup_done:
      Pop $2
      Pop $1
      Pop $0
  FunctionEnd

  Function un.QzCleanup
    ; Every update and every silent uninstall keeps records, irrespective of UI state.
    ${If} $QzClearData != ${BST_CHECKED}
      Return
    ${EndIf}
    ${If} ${Silent}
      Return
    ${EndIf}
    ${If} ${isUpdated}
      Return
    ${EndIf}
    Push $0
    Push $1
    ClearErrors
    ${GetParameters} $0
    ${GetOptions} $0 "/KEEP_APP_DATA" $1
    ${IfNot} ${Errors}
      Pop $1
      Pop $0
      Return
    ${EndIf}
    SetShellVarContext current
    GetFullPathName $QzDataPath "$APPDATA\${QZ_STUDY_DIR}"
    GetFullPathName $QzCachePath "$LOCALAPPDATA\${QZ_CACHE_DIR}"
    ; Names are compiled constants. Reject empty, parent/root, or noncanonical results.
    ${If} $APPDATA == ""
    ${OrIf} $LOCALAPPDATA == ""
    ${OrIf} $QzDataPath != "$APPDATA\${QZ_STUDY_DIR}"
    ${OrIf} $QzCachePath != "$LOCALAPPDATA\${QZ_CACHE_DIR}"
      StrCpy $QzCleanupSummary "程序已卸载，但数据路径无法安全确认，本机记录未清理。"
    ${Else}
      StrCpy $QzCleanupSummary "程序已卸载。已按选择清理本机学习记录与缓存；如有残留，位置如下："
      Push $QzDataPath
      Call un.QzCleanOne
      Push $QzCachePath
      Call un.QzCleanOne
    ${EndIf}
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
    Pop $1
    Pop $0
  FunctionEnd
!endif
!macroend

!macro customUnInit
  StrCpy $QzClearData 0
  StrCpy $QzCleanupSummary "轻舟已卸载。本机学习记录已保留，重装后可继续使用。"
!macroend

!macro customUnWelcomePage
  UninstPage custom un.QzWelcome un.QzWelcomeLeave
!macroend

!macro customUninstallPage
  !define MUI_FINISHPAGE_TEXT "$QzCleanupSummary"
  !define MUI_FINISHPAGE_TEXT_LARGE
!macroend

!macro customUnInstall
  Call un.QzCleanup
!macroend
