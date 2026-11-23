# Builds Ledger Trust and installs it for the current Windows user, with
# "Ledger Trust" shortcuts on the Desktop and in the Start menu.
# Run from the project folder with:  pnpm run install-app
# Re-run it after code changes to update the installed copy.
# Client data is not touched: it lives in %APPDATA%\agentobi.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (Get-Process -Name "LedgerTrust" -ErrorAction SilentlyContinue) {
  throw "Ledger Trust is running. Close it, then run this again."
}

# OneDrive can briefly lock files in node_modules; retry the build a few times.
$built = $false
for ($attempt = 1; $attempt -le 3 -and -not $built; $attempt++) {
  Write-Host "Building Ledger Trust (attempt $attempt)..."
  pnpm package
  $built = ($LASTEXITCODE -eq 0)
}
if (-not $built) { throw "The build failed. See the messages above." }

$source = Join-Path $root "out\Ledger Trust-win32-x64"
$target = Join-Path $env:LOCALAPPDATA "Programs\Ledger Trust"
if (Test-Path $target) { Remove-Item -Recurse -Force $target }
New-Item -ItemType Directory -Force (Split-Path -Parent $target) | Out-Null
Copy-Item -Recurse $source $target

$exe = Join-Path $target "LedgerTrust.exe"
$shell = New-Object -ComObject WScript.Shell
$folders = @(
  [Environment]::GetFolderPath("Desktop"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs")
)
foreach ($folder in $folders) {
  $shortcut = $shell.CreateShortcut((Join-Path $folder "Ledger Trust.lnk"))
  $shortcut.TargetPath = $exe
  $shortcut.WorkingDirectory = $target
  $shortcut.Description = "Ledger Trust bookkeeping"
  $shortcut.Save()
}

Write-Host ""
Write-Host "Installed to $target"
Write-Host "Double-click 'Ledger Trust' on your Desktop or in the Start menu to open it."
