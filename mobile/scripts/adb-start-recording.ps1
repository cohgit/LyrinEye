# LyrinEye: iniciar Monitor en modo grabación por ADB (Wi‑Fi o USB).
# Requisitos: sesión Google ya iniciada en la app; permisos de cámara concedidos al menos una vez.
# Uso: .\adb-start-recording.ps1
#      .\adb-start-recording.ps1 -Device 192.168.1.86:5555

param(
    [string] $Device = "",
    [string] $AdbPath = ""
)

$ErrorActionPreference = "Stop"

if (-not $AdbPath) {
    $candidates = @(
        "$PSScriptRoot\..\..\..\cogaldetools\scrcpy-win64-v3.1\adb.exe",
        "$env:USERPROFILE\..\cogaldetools\scrcpy-win64-v3.1\adb.exe",
        "C:\Users\cogaldetools\scrcpy-win64-v3.1\adb.exe",
        (Get-Command adb -ErrorAction SilentlyContinue).Source
    ) | Where-Object { $_ -and (Test-Path $_) }
    if ($candidates.Count -eq 0) {
        Write-Host "No se encontró adb.exe. Indica -AdbPath" -ForegroundColor Red
        exit 1
    }
    $AdbPath = $candidates[0]
}

$adbArgs = @()
if ($Device) {
    $adbArgs += "-s", $Device
}

& $AdbPath @adbArgs shell am broadcast -a com.mobile.lyrineye.app.ADB_START_RECORD
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "Broadcast enviado. Si la app estaba cerrada, debería abrirse Monitor y REC." -ForegroundColor Green
Write-Host "Alternativa: '$AdbPath' $($adbArgs -join ' ') shell am start -a android.intent.action.VIEW -d lyrineye://adb/record -n com.mobile.lyrineye.app/.MainActivity" -ForegroundColor DarkGray
