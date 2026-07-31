<#
  Runs every suite and prints a summary.

  Set DISABLE_RATE_LIMIT=true in backend/.env and restart the backend first.

  The suites share the in-memory rate-limit budgets (10 logins per 15 min, 5 sensitive actions per
  hour), so without the flag the first few exhaust the quota and the rest skip entirely. The flag
  is ignored in production.

  Seed ObjectIds are deterministic, so a backend restart no longer invalidates Next's cached pet
  ids and clearing .next is not required.

  Usage:
    # set DISABLE_RATE_LIMIT=true in backend/.env, restart the backend, then
    powershell -File tests/run-all.ps1

  Expected: 460 checks, 0 failed, 1 skipped (the skip needs Cloudinary credentials).
#>

$suites = @(
  'auth-api', 'auth-frontend', 'home-page', 'pets-listing', 'pet-detail',
  'adoptions', 'adoptions-frontend', 'dashboard',
  # 'shelter' must precede 'admin': it creates the pending listings the pet-moderation checks
  # need, and the seed alone produces none.
  'shelter', 'admin', 'upload', 'notifications', 'messaging',
  'donations', 'donations-frontend', 'payments', 'reviews', 'reviews-frontend'
)
$root = $PSScriptRoot

$total = 0; $failed = 0; $skipped = 0

foreach ($suite in $suites) {
  $output = & "$root\$suite.ps1" 2>&1 | Out-String
  $passed = ([regex]::Matches($output, '  PASS  ')).Count
  $fails = ([regex]::Matches($output, '  FAIL  ')).Count
  $skips = ([regex]::Matches($output, '  SKIP  ')).Count

  $total += $passed + $fails
  $failed += $fails
  $skipped += $skips

  Write-Output ("  {0,-16} {1,3} passed, {2} failed, {3} skipped" -f $suite, $passed, $fails, $skips)

  if ($fails -gt 0) {
    ($output -split "`n" | Select-String '  FAIL') | ForEach-Object { Write-Output "        $_" }
  }
}

Write-Output '  ------------------------------------------------'
Write-Output "  TOTAL: $total checks, $failed failed, $skipped skipped"

<#
  Socket behaviour cannot be exercised from PowerShell — it has no WebSocket client — so the
  realtime gates (handshake auth, room isolation, delivery latency, offline persistence) live in a
  Node script instead. Run it separately:

    cd backend && npx tsx src/scripts/realtime-check.ts
#>
Write-Output ''
Write-Output '  Realtime gates are separate: cd backend && npx tsx src/scripts/realtime-check.ts'

if ($failed -gt 0) { exit 1 }
