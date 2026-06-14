$ErrorActionPreference = 'Stop'
$fe = 'http://localhost:3000'
$api = 'http://localhost:5000/api/v1'
$email = "fe$(Get-Random -Maximum 999999)@example.com"
$pass = 'TestPass123'
$script:fails = 0

function Check($label, $condition, $detail) {
  if ($condition) { Write-Output "  PASS  $label" }
  else { Write-Output "  FAIL  $label  -> $detail"; $script:fails++ }
}

function Get-Page($url, $session, $allowRedirect = $false) {
  $params = @{ Uri = $url; UseBasicParsing = $true; MaximumRedirection = 0 }
  if ($session) { $params.WebSession = $session }
  if ($allowRedirect) { $params.MaximumRedirection = 5 }
  try {
    $r = Invoke-WebRequest @params
    return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $r.Content; Location = $r.Headers.Location }
  } catch {
    $resp = $_.Exception.Response
    $status = if ($resp) { [int]$resp.StatusCode } else { 0 }
    $loc = if ($resp -and $resp.Headers) { $resp.Headers['Location'] } else { $null }
    return [pscustomobject]@{ Status = $status; Body = $_.ErrorDetails.Message; Location = $loc }
  }
}

Write-Output "`n=== 1. Public pages render ==="
foreach ($p in @('/', '/login', '/register', '/forgot-password')) {
  $r = Get-Page "$fe$p" $null $true
  Check "$p returns 200" ($r.Status -eq 200) "got $($r.Status)"
}

$r = Get-Page "$fe/login" $null $true
Check "login page shows the form" ($r.Body -match 'Welcome back' -and $r.Body -match 'Sign in with Google') "form markup missing"
Check "register link present" ($r.Body -match 'Create an account') "missing"

$r = Get-Page "$fe/register" $null $true
Check "register page shows terms checkbox" ($r.Body -match 'Terms of Service') "missing"

Write-Output "`n=== 2. Middleware guards protected routes ==="
$r = Get-Page "$fe/dashboard" $null $false
Check "/dashboard redirects when signed out" ($r.Status -eq 307 -or $r.Status -eq 302) "got $($r.Status)"
Check "redirect preserves callbackUrl" ($r.Location -match 'callbackUrl=%2Fdashboard') "location: $($r.Location)"

Write-Output "`n=== 3. Signed-out navbar ==="
$r = Get-Page "$fe/" $null $true
Check "shows Sign in when signed out" ($r.Body -match 'Sign in') "missing"
Check "no avatar menu when signed out" (-not ($r.Body -match 'Account menu')) "avatar menu leaked"

Write-Output "`n=== 4. Sign in, then SSR reflects the session ==="

<#
  Establishes a session, resilient to the shared auth rate limiter (10 per 15 min for register AND
  login combined). Running this after auth-api.ps1 will usually have spent that budget, so:
    1. try registering a fresh user
    2. fall back to the seeded demo account
    3. if both are limited, skip the signed-in checks rather than report false failures
#>
function New-AuthSession {
  $sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession

  $attempts = @(
    @{ Path = '/auth/register'; Body = @{ name = 'Frontend Tester'; email = $email; password = $pass }; Name = 'Frontend Tester' },
    @{ Path = '/auth/login';    Body = @{ email = 'adopter@pawfecthome.seed'; password = 'DemoPass123' }; Name = 'Demo Adopter' }
  )

  foreach ($attempt in $attempts) {
    try {
      $null = Invoke-WebRequest -Uri "$api$($attempt.Path)" -Method POST -UseBasicParsing -WebSession $sess `
        -ContentType 'application/json' -Body ($attempt.Body | ConvertTo-Json -Compress)
      return [pscustomobject]@{ Session = $sess; Name = $attempt.Name }
    } catch {
      # Anything other than a rate limit is a genuine failure worth surfacing.
      if ([int]$_.Exception.Response.StatusCode -ne 429) { throw }
    }
  }
  return $null
}

$auth = New-AuthSession

if (-not $auth) {
  Write-Output "  SKIP  signed-in checks - auth rate limited (restart the backend to reset)"
} else {
  # Cookies were set for localhost:5000; a browser would send them to :3000 too since cookies
  # ignore ports. Re-add them explicitly for the frontend origin.
  $feSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  foreach ($c in $auth.Session.Cookies.GetCookies($api)) {
    $feSession.Cookies.Add((New-Object System.Net.Cookie($c.Name, $c.Value, '/', 'localhost')))
  }

  Write-Output "  (signed in as: $($auth.Name))"
  $firstName = $auth.Name.Split(' ')[0]
  $isFreshUser = $auth.Name -eq 'Frontend Tester'
  $expectedEmail = if ($isFreshUser) { $email } else { 'adopter@pawfecthome.seed' }

  $r = Get-Page "$fe/" $feSession $true
  Check "navbar renders avatar menu when signed in" ($r.Body -match 'Account menu') "avatar menu missing"
  Check "signed-in home hides Get started CTA" (-not ($r.Body -match 'Get started')) "CTA still shown"

  $r = Get-Page "$fe/dashboard" $feSession $true
  Check "/dashboard now reachable" ($r.Status -eq 200) "got $($r.Status)"
  # React separates static text from an interpolated expression with an empty comment node,
  # so the rendered markup is "Welcome back, <!-- -->Frontend".
  Check "dashboard greets the user by name" ($r.Body -match "Welcome back,\s*(<!--\s*-->)?\s*$firstName") 'greeting missing'
  Check "dashboard shows the email" ($r.Body -match [regex]::Escape($expectedEmail)) 'email missing'

  # The seeded demo account is already verified, so the banner only applies to a fresh signup.
  if ($isFreshUser) {
    Check "unverified email banner shown" ($r.Body -match 'Confirm your email address') 'banner missing'
  } else {
    Check "verified account hides the banner" (-not ($r.Body -match 'Confirm your email address')) 'banner shown for a verified account'
  }

  Write-Output "`n=== 5. Signed-in users bounced off auth pages ==="
  $r = Get-Page "$fe/login" $feSession $false
  Check "/login redirects when signed in" ($r.Status -eq 307 -or $r.Status -eq 302) "got $($r.Status)"
  Check "redirects to /dashboard" ($r.Location -match '/dashboard') "location: $($r.Location)"
}

Write-Output "`n=== 6. Verify-email page (SSR against the API) ==="
$r = Get-Page "$fe/verify-email?token=bogus-token" $null $true
Check "bad token shows failure state" ($r.Body -match 'Verification failed') "state missing"
$r = Get-Page "$fe/verify-email" $null $true
Check "missing token handled" ($r.Body -match 'missing its token') "not handled"

Write-Output "`n=== 7. 403 page ==="
$r = Get-Page "$fe/403" $null $true
Check "403 page renders" ($r.Status -eq 200 -and $r.Body -match 'Access denied') "got $($r.Status)"

Write-Output "`n================================"
if ($script:fails -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "$($script:fails) CHECK(S) FAILED" }
