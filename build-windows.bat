@echo off
REM One-click build: frontend into server\router\frontend\dist, then memos.exe into bin\.
REM Requires Node 24 + pnpm and Go 1.26 on PATH.
setlocal
cd /d "%~dp0"

REM Guard: the Blog 2 styles must be present in this source tree.
if not exist "web\src\themes\blog-styles.css" (
  echo ERROR: web\src\themes\blog-styles.css not found.
  echo The blog2-styles changes are not in this source tree. Unzip blog2-styles.zip here first.
  goto :fail
)

echo [1/3] Installing frontend dependencies...
rem Remove files left over from the earlier handsome package.
if exist "web\src\components\BlogArticleMeta.tsx" del /q "web\src\components\BlogArticleMeta.tsx"
if exist "web\src\components\BlogBand.tsx" del /q "web\src\components\BlogBand.tsx"
if exist "web\src\themes\styles.css" del /q "web\src\themes\styles.css"
if exist "web\src\utils\blog-display.ts" del /q "web\src\utils\blog-display.ts"
if exist "web\src\themes\handsome-autumn.css" del /q "web\src\themes\handsome-autumn.css"
if exist "web\src\themes\handsome-dark.css" del /q "web\src\themes\handsome-dark.css"
if exist "web\src\themes\handsome-grass.css" del /q "web\src\themes\handsome-grass.css"
if exist "web\src\themes\handsome-layout.css" del /q "web\src\themes\handsome-layout.css"
if exist "web\src\themes\handsome-pink.css" del /q "web\src\themes\handsome-pink.css"
if exist "web\src\themes\handsome-summer.css" del /q "web\src\themes\handsome-summer.css"
if exist "web\src\themes\handsome-winter.css" del /q "web\src\themes\handsome-winter.css"

pushd web
call pnpm install || goto :fail

echo [2/3] Building frontend...
call pnpm release || goto :fail
popd
if not exist "server\router\frontend\dist\assets" (
  echo ERROR: frontend build produced no assets.
  goto :fail
)

echo [3/3] Building memos.exe...
if not exist bin mkdir bin
set CGO_ENABLED=0
REM The About page links this commit; the version itself stays a development build.
set COMMIT=unknown
for /f %%i in ('git rev-parse HEAD 2^>nul') do set COMMIT=%%i
go build -trimpath -ldflags "-s -w -X github.com/usememos/memos/internal/version.Commit=%COMMIT%" -o bin\memos.exe .\cmd\memos || goto :fail

echo.
echo Done: %~dp0bin\memos.exe
pause
exit /b 0

:fail
echo.
echo Build failed.
popd 2>nul
pause
exit /b 1
