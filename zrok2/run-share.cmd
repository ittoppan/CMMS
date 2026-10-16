@echo off
rem zrok reserved-share supervisor for scheduled tasks (runs as SYSTEM at boot).
rem Usage: run-share.cmd <localTargetPort> <reservedShareName>
setlocal
cd /d "%~dp0"
set "USERPROFILE=C:\Users\administrator.MAJEND-AMT"
set "HOME=C:\Users\administrator.MAJEND-AMT"
:loop
echo [%DATE% %TIME%] START port=%1 name=%2 USERPROFILE=%USERPROFILE% >> "%~dp0run-share-%1.log"
"C:\inetpub\wwwroot\cmms-tpt\zrok2\zrok2.exe" share public %1 --name-selection public:%2 --headless >> "%~dp0run-share-%1.log" 2>&1
echo [%DATE% %TIME%] EXIT code=%ERRORLEVEL% port=%1 - restarting in 10s >> "%~dp0run-share-%1.log"
ping 127.0.0.1 -n 11 >nul
goto loop
endlocal
