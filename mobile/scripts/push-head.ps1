# Pushes the push worktree's HEAD to main, holding the machine for the push gate the whole time.
# gate-lock.cjs writes C:/tmp/push-gate.lock (who, since) before git starts and removes it when git
# ends, refused or not; while it is there, no mutants run, wide jest run, Stryker run or second gate
# starts on this machine but the gate's own. The gate's whole output is kept in the log (UTF-16: read
# it with wake.cjs). C:/tmp/push-head.ps1 runs this file from the push worktree.
param(
  [string]$Checkout = 'C:/rh-sdk57',
  [string]$Log = 'C:/tmp/main-push.log'
)
Set-Location $Checkout
$head = git rev-parse --short HEAD
node mobile/scripts/gate-lock.cjs hold --who "push-head.ps1: $Checkout at $head to main" -- git push origin HEAD:main *>&1 | Tee-Object -FilePath $Log
Write-Output PUSH-MAIN-DONE
