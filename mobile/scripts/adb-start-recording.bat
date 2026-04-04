@echo off
REM Uso: adb-start-recording.bat [serial]
REM Ejemplo Wi-Fi: adb-start-recording.bat 192.168.1.86:5555

setlocal
set ADB=C:\Users\cogaldetools\scrcpy-win64-v3.1\adb.exe
if not exist "%ADB%" set ADB=adb

if "%~1"=="" (
  "%ADB%" shell am broadcast -a com.mobile.lyrineye.app.ADB_START_RECORD
) else (
  "%ADB%" -s %1 shell am broadcast -a com.mobile.lyrineye.app.ADB_START_RECORD
)
