@echo off
setlocal
cd /d "E:\Codex Project\Finding chance\polymarket-calendar-sim"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "E:\Codex Project\Finding chance\polymarket-calendar-sim\scripts\trigger-paper-scan.ps1" >> "E:\Codex Project\Finding chance\polymarket-calendar-sim\data\windows-scan-trigger.log" 2>&1
