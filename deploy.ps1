# Deploys youravdept.com to Netlify without private or working files.
# Usage (from the website folder):  .\deploy.ps1
# Copies the site to a temp folder, leaving out everything in $Exclude,
# then deploys that copy to production.

$ErrorActionPreference = 'Stop'
$Site    = $PSScriptRoot
$Staging = Join-Path $env:TEMP 'youravdept-deploy'

# Folders and files that must never reach the live site
$ExcludeDirs  = @('Claude outputs', 'claude', 'docs', '.git', '.netlify', 'node_modules')
$ExcludeFiles = @('deploy.ps1', 'README.md', '.gitignore', '*.docx', '*.patch', '*.gs')

if (Test-Path $Staging) { Remove-Item $Staging -Recurse -Force }
robocopy $Site $Staging /E /XD $ExcludeDirs /XF $ExcludeFiles /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copy failed (robocopy exit $LASTEXITCODE)" }

Write-Host "Deploying from $Staging (excluded: $($ExcludeDirs -join ', '))" -ForegroundColor Cyan
Push-Location $Site
try {
    netlify deploy --prod --dir $Staging --functions (Join-Path $Site 'netlify\functions')
} finally {
    Pop-Location
    Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
}
