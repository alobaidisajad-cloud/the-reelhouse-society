param(
    [string]$Message = "fix: update"
)

Write-Host "ReelHouse Deploy" -ForegroundColor Yellow
git add -A
git commit -m $Message
git push origin main
Write-Host "Done! Vercel will deploy in ~30s." -ForegroundColor Green
