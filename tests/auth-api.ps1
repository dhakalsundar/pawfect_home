$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5000/api/v1'
$email = "test$(Get-Random -Maximum 999999)@example.com"
$pass  = 'TestPass123'
$script:fails = 0

function Check($label, $condition, $detail) {
  if ($condition) { Write-Output "  PASS  $label" }
  else { Write-Output "  FAIL  $label  -> $detail"; $script:fails++ }
}

# Windows PowerShell 5.1 has no -SkipHttpErrorCheck, so non-2xx responses throw.
# Catch them and normalise into {Status, Body, Json} like a normal HTTP client would.
function Req($method, $path, $body, $session, $headers) {
  $params = @{
    Uri = "$base$path"; Method = $method; UseBasicParsing = $true
  }
  if ($session) { $params.WebSession = $session }
  if ($body)    { $params.Body = ($body | ConvertTo-Json -Compress); $params.ContentType = 'application/json' }
  if ($headers) { $params.Headers = $headers }

  try {
    $r = Invoke-WebRequest @params
    $status = [int]$r.StatusCode; $content = $r.Content
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    $content = $_.ErrorDetails.Message
  }

  $json = $null
  if ($content) { try { $json = $content | ConvertFrom-Json } catch { } }
  return [pscustomobject]@{ Status = $status; Body = $content; Json = $json }
}

function NewSession { New-Object Microsoft.PowerShell.Commands.WebRequestSession }
function Cookie($session, $name) { $session.Cookies.GetCookies($base) | Where-Object Name -eq $name }

Write-Output "`n=== 1. Registration ==="
$s = NewSession
$r = Req POST '/auth/register' @{ name='Test User'; email=$email; password=$pass } $s
Check "register returns 201" ($r.Status -eq 201) "got $($r.Status): $($r.Body)"
Check "returns the user" ($r.Json.data.email -eq $email) "$($r.Body)"
Check "password never serialised" (-not ($r.Body -match 'password')) "password appeared in response"
Check "emailVerified false initially" ($r.Json.data.emailVerified -eq $false) "$($r.Json.data.emailVerified)"
Check "role defaults to user" ($r.Json.data.role -eq 'user') "$($r.Json.data.role)"
Check "access cookie is httpOnly" ((Cookie $s 'ph_access').HttpOnly -eq $true) "missing or not httpOnly"
Check "refresh cookie is httpOnly" ((Cookie $s 'ph_refresh').HttpOnly -eq $true) "missing or not httpOnly"
Check "csrf cookie readable by JS" ((Cookie $s 'ph_csrf') -and (Cookie $s 'ph_csrf').HttpOnly -eq $false) "should exist and not be httpOnly"

Write-Output "`n=== 2. Validation ==="
$r = Req POST '/auth/register' @{ name='X'; email='bad'; password='weak' } (NewSession)
Check "422 on invalid input" ($r.Status -eq 422) "got $($r.Status)"
Check "per-field errors returned" ($r.Json.error.fields.name -and $r.Json.error.fields.email -and $r.Json.error.fields.password) "$($r.Body)"

$r = Req POST '/auth/register' @{ name='Dup User'; email=$email; password=$pass } (NewSession)
Check "409 on duplicate email" ($r.Status -eq 409) "got $($r.Status)"

Write-Output "`n=== 3. Session ==="
$r = Req GET '/auth/me' $null $s
Check "/me returns current user" ($r.Status -eq 200 -and $r.Json.data.email -eq $email) "got $($r.Status): $($r.Body)"

$r = Req GET '/auth/me' $null (NewSession)
Check "/me is 401 without cookies" ($r.Status -eq 401 -and $r.Json.error.code -eq 'UNAUTHENTICATED') "got $($r.Status)"

Write-Output "`n=== 4. Login + user enumeration resistance ==="
$s2 = NewSession
$wrong = Req POST '/auth/login' @{ email=$email; password='WrongPass123' } $s2
Check "wrong password is 401" ($wrong.Status -eq 401) "got $($wrong.Status)"

$ghost = Req POST '/auth/login' @{ email="nobody$(Get-Random)@example.com"; password='Whatever123' } (NewSession)
Check "unknown email is 401" ($ghost.Status -eq 401) "got $($ghost.Status)"
Check "identical message for both" ($wrong.Json.error.message -eq $ghost.Json.error.message) "'$($wrong.Json.error.message)' vs '$($ghost.Json.error.message)'"

$r = Req POST '/auth/login' @{ email=$email; password=$pass } $s2
Check "correct password is 200" ($r.Status -eq 200) "got $($r.Status): $($r.Body)"

Write-Output "`n=== 5. CSRF protection ==="
$r = Req POST '/auth/logout' $null $s2
Check "logout without CSRF header is 403" ($r.Status -eq 403) "got $($r.Status)"

$csrf = (Cookie $s2 'ph_csrf').Value
$r = Req POST '/auth/logout' $null $s2 @{ 'X-CSRF-Token' = $csrf }
Check "logout with CSRF header succeeds" ($r.Status -eq 200) "got $($r.Status): $($r.Body)"

$r = Req GET '/auth/me' $null $s2
Check "session dead after logout" ($r.Status -eq 401) "got $($r.Status)"

Write-Output "`n=== 6. Refresh rotation + reuse detection ==="
$s3 = NewSession
$null = Req POST '/auth/login' @{ email=$email; password=$pass } $s3
$oldRefresh = (Cookie $s3 'ph_refresh').Value

$r = Req POST '/auth/refresh' $null $s3
$newRefresh = (Cookie $s3 'ph_refresh').Value
Check "refresh returns 200" ($r.Status -eq 200) "got $($r.Status): $($r.Body)"
Check "refresh token was rotated" ($newRefresh -and $newRefresh -ne $oldRefresh) "token unchanged"

$r = Req GET '/auth/me' $null $s3
Check "session still valid after refresh" ($r.Status -eq 200) "got $($r.Status)"

# Replay the superseded token, simulating a stolen one
$stolen = NewSession
$stolen.Cookies.Add((New-Object System.Net.Cookie('ph_refresh', $oldRefresh, '/', 'localhost')))
$r = Req POST '/auth/refresh' $null $stolen
Check "replayed old refresh token rejected" ($r.Status -eq 401) "got $($r.Status)"

# The legitimate client's current token must now be dead too - the whole family is revoked
$r = Req POST '/auth/refresh' $null $s3
Check "entire token family revoked after reuse" ($r.Status -eq 401) "got $($r.Status) - family NOT revoked"

Write-Output "`n=== 7. Password reset ==="
$real  = Req POST '/auth/forgot-password' @{ email=$email } (NewSession)
$fake  = Req POST '/auth/forgot-password' @{ email="ghost$(Get-Random)@example.com" } (NewSession)
Check "forgot-password 200 for real address" ($real.Status -eq 200) "got $($real.Status)"
Check "forgot-password 200 for unknown address" ($fake.Status -eq 200) "got $($fake.Status)"
Check "responses are byte-identical" ($real.Body -eq $fake.Body) "'$($real.Body)' vs '$($fake.Body)'"

$r = Req POST '/auth/reset-password' @{ token='invalid-token-xyz'; password='NewPass456' } (NewSession)
Check "invalid reset token rejected" ($r.Status -eq 422) "got $($r.Status)"

Write-Output "`n=== 8. Password policy ==="
# By this point the suite has spent most of its 10-per-15-min registration budget, so a 429 here
# means "limiter working", not "policy broken". Report it as a skip and rely on the direct schema
# test for full coverage:  cd backend && npx tsx src/scripts/policy-check.ts
foreach ($case in @(
  @{ pw='short1A';       why='too short' },
  @{ pw='alllowercase1'; why='no uppercase' },
  @{ pw='ALLUPPERCASE1'; why='no lowercase' },
  @{ pw='NoDigitsHere';  why='no digit' }
)) {
  $r = Req POST '/auth/register' @{ name='Policy Test'; email="pol$(Get-Random)@example.com"; password=$case.pw } (NewSession)
  if ($r.Status -eq 429) {
    Write-Output "  SKIP  rejects password: $($case.why) - rate limited (see policy-check.ts)"
  } else {
    Check "rejects password: $($case.why)" ($r.Status -eq 422) "got $($r.Status)"
  }
}

Write-Output "`n=== 9. Health ==="
$r = Req GET '/health' $null (NewSession)
Check "database reports connected" ($r.Json.data.database.state -eq 'connected') "$($r.Json.data.database.state)"
Check "ephemeral flag set for in-memory DB" ($r.Json.data.database.ephemeral -eq $true) "$($r.Json.data.database.ephemeral)"

Write-Output "`n================================"
if ($script:fails -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "$($script:fails) CHECK(S) FAILED" }
