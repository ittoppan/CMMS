@echo off
setlocal
cd /d "%~dp0"
start "zrok-cmms" /min zrok2.exe share public 3001 --name-selection public:cmms-tpt --headless
start "zrok-api"  /min zrok2.exe share public 8081 --name-selection public:cmms-tpt-api --headless
endlocal
