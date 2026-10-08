@echo off
cd /d "C:\inetpub\wwwroot\cmms-tpt\zrok_2.0.4_windows_amd64"
start /b zrok2.exe share public 3001 --name-selection public:cmms-tpt --headless
start /b zrok2.exe share public 8081 --name-selection public:cmms-tpt-api --headless