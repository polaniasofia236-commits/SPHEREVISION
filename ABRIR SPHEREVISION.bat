@echo off
setlocal
cd /d "%~dp0"

set "SPHEREVISION_NODE=C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1112-737-0_26.1112.737.0_x64__3k8sg7r9htsxt\dependencies\node\bin\node.exe"
if not exist "%SPHEREVISION_NODE%" set "SPHEREVISION_NODE="
if not defined SPHEREVISION_NODE for /f "delims=" %%N in ('where node 2^>nul') do if not defined SPHEREVISION_NODE set "SPHEREVISION_NODE=%%N"

if not defined SPHEREVISION_NODE (
  echo No encontramos el componente necesario para iniciar SPHEREVISION.
  echo Comprueba que extrajiste todos los archivos en una carpeta.
  pause
  exit /b 1
)

set "PORT=0"
set "SPHEREVISION_OPEN_BROWSER=1"
echo Iniciando SPHEREVISION. Deja esta ventana abierta mientras usas la pagina.
echo Si aparece un mensaje de error, puedes enviarnos una captura.
echo.
"%SPHEREVISION_NODE%" server.mjs
echo.
echo SPHEREVISION se cerro. Si no se abrio el navegador, envia una captura de esta ventana.
pause
