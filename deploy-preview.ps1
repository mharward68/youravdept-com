# Draft deploy of youravdept.com for testing. NEVER touches the live site.
# Usage (from the website folder):  .\deploy-preview.ps1
# Same staging and exclusions as deploy.ps1, but no --prod. Every run updates
# one stable test address:  https://offers--your-av-dept.netlify.app
# Offer data written from this address goes to the "-test" stores, never the
# live ones (storeName() in shared/offer-contract.js).

$ErrorActionPreference = 'Stop'
$Site    = $PSScriptRoot
$Staging = Join-Path $env:TEMP 'youravdept-deploy-preview'
$Alias   = 'offers'

# Keep in step with deploy.ps1
$ExcludeDirs  = @('Claude outputs', 'claude', 'docs', '.git', '.netlify', 'node_modules', 'ai', 'netlify')
$ExcludeFiles = @('deploy.ps1', 'deploy-preview.ps1', 'README.md', '.gitignore', 'netlify.toml', 'package.json', 'package-lock.json', '*.docx', '*.patch', '*.gs')

if (-not (Test-Path (Join-Path $Site 'node_modules\@netlify\blobs'))) {
    throw "Run 'npm install' in $Site first (functions need @netlify/blobs)."
}

if (Test-Path $Staging) { Remove-Item $Staging -Recurse -Force }
robocopy $Site $Staging /E /XD $ExcludeDirs /XF $ExcludeFiles /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copy failed (robocopy exit $LASTEXITCODE)" }

Write-Host "DRAFT deploy (not live) from $Staging" -ForegroundColor Yellow
Push-Location $Site
try {
    netlify deploy --dir $Staging --functions (Join-Path $Site 'netlify\functions') --alias $Alias --message "Offers module draft $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
} finally {
    Pop-Location
    Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "Test address: https://$Alias--your-av-dept.netlify.app" -ForegroundColor Green
