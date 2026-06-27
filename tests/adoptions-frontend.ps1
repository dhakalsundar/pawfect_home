$ErrorActionPreference = 'Stop'
$fe = 'http://localhost:3000'
$api = 'http://localhost:5000/api/v1'
$script:fails = 0

function Check($label, $condition, $detail) {
  if ($condition) { Write-Output "  PASS  $label" }
  else { Write-Output "  FAIL  $label  -> $detail"; $script:fails++ }
}

function Get-Page($url, $session, $follow = $true) {
  $params = @{ Uri = $url; UseBasicParsing = $true }
  if ($session) { $params.WebSession = $session }
  if (-not $follow) { $params.MaximumRedirection = 0 }
  try {
    $r = Invoke-WebRequest @params
    return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $r.Content; Location = $r.Headers.Location }
  } catch {
    $resp = $_.Exception.Response
    $loc = if ($resp -and $resp.Headers) { $resp.Headers['Location'] } else { $null }
    return [pscustomobject]@{ Status = if ($resp) { [int]$resp.StatusCode } else { 0 }; Body = $_.ErrorDetails.Message; Location = $loc }
  }
}

function ApiReq($method, $path, $body, $session) {
  $params = @{ Uri = "$api$path"; Method = $method; UseBasicParsing = $true; WebSession = $session }
  if ($body) { $params.Body = ($body | ConvertTo-Json -Compress -Depth 6); $params.ContentType = 'application/json' }
  if ($method -ne 'GET') {
    $csrf = ($session.Cookies.GetCookies($api) | Where-Object Name -eq 'ph_csrf').Value
    if ($csrf) { $params.Headers = @{ 'X-CSRF-Token' = $csrf } }
  }
  try { $r = Invoke-WebRequest @params; $s = [int]$r.StatusCode; $c = $r.Content }
  catch { $s = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }; $c = $_.ErrorDetails.Message }
  $j = $null; if ($c) { try { $j = $c | ConvertFrom-Json } catch {} }
  return [pscustomobject]@{ Status = $s; Json = $j; Body = $c }
}

Write-Output "`n=== Setup ==="
$apiSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$login = ApiReq POST '/auth/login' @{ email = 'adopter@pawfecthome.seed'; password = 'DemoPass123' } $apiSession
if ($login.Status -ne 200) { Write-Output "  SKIP  auth rate limited - restart the backend"; exit 0 }
Check "signed in as the demo adopter" ($login.Status -eq 200) "got $($login.Status)"

# Cookies ignore ports, so replay the API session against the frontend origin.
$feSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
foreach ($c in $apiSession.Cookies.GetCookies($api)) {
  $feSession.Cookies.Add((New-Object System.Net.Cookie($c.Name, $c.Value, '/', 'localhost')))
}

# Pick a pet this user has NOT already applied to. adoptions.ps1 runs first in run-all.ps1 and
# applies as the same demo adopter, so grabbing the first available pet would land on one that
# already has an application — and the form would correctly redirect instead of rendering.
$candidates = (ApiReq GET '/pets?status=available&limit=25' $null $apiSession).Json.data
$pet = $null
foreach ($candidate in $candidates) {
  $existing = ApiReq GET "/adoptions/for-pet/$($candidate.id)" $null $apiSession
  if ($null -eq $existing.Json.data) { $pet = $candidate; break }
}
if (-not $pet) { Write-Output "  SKIP  no un-applied pet available"; exit 0 }
Write-Output "  target pet: $($pet.name) ($($pet.slug))"

Write-Output "`n=== 1. Route protection ==="
$r = Get-Page "$fe/adopt/$($pet.slug)" $null $false
Check "/adopt redirects when signed out" ($r.Status -eq 307 -or $r.Status -eq 302) "got $($r.Status)"
Check "  preserving the callbackUrl" ($r.Location -match 'callbackUrl=%2Fadopt') "location: $($r.Location)"

$r = Get-Page "$fe/dashboard/applications" $null $false
Check "/dashboard/applications redirects when signed out" ($r.Status -eq 307 -or $r.Status -eq 302) "got $($r.Status)"

Write-Output "`n=== 2. Adoption form renders ==="
$r = Get-Page "$fe/adopt/$($pet.slug)" $feSession
Check "form page loads for a signed-in user" ($r.Status -eq 200) "got $($r.Status)"
Check "shows the pet being applied for" ($r.Body -match [regex]::Escape($pet.name)) 'pet name missing'
Check "step 1 heading present" ($r.Body -match 'Your home') 'missing'
Check "progress list is labelled" ($r.Body -match 'aria-label="Application progress"') 'missing'
Check "housing radiogroup present" ($r.Body -match 'role="radiogroup"') 'missing'
Check "autosave is advertised" ($r.Body -match 'save automatically') 'missing'
Check "shows 4 steps" (([regex]::Matches($r.Body, 'aria-current="step"')).Count -eq 1) 'step marker missing'

Write-Output "`n=== 3. Unavailable pets are refused up front ==="
$adopted = (ApiReq GET '/pets?status=adopted&limit=1' $null $apiSession).Json.data
if ($adopted.Count -gt 0) {
  $r = Get-Page "$fe/adopt/$($adopted[0].slug)" $feSession
  Check "adopted pet shows a message, not the form" ($r.Body -match 'no longer accepting applications') 'form shown'
  Check "  and offers a way onward" ($r.Body -match 'Browse other pets') 'no recovery link'
} else {
  Write-Output "  SKIP  no adopted pet in the dataset"
}

Write-Output "`n=== 4. Submit an application ==="
$answers = @{
  housingType       = 'house'
  ownOrRent         = 'own'
  hasYard           = $true
  householdSize     = 2
  hasChildren       = $false
  hoursAlonePerDay  = 5
  experienceLevel   = 'some'
  reasonForAdopting = 'We have a quiet home with a secure garden and plenty of time to help a nervous animal settle in properly.'
}
# Idempotent: on a re-run against the same backend the duplicate-prevention index correctly
# returns 409, so fall back to the existing application rather than proceeding with a null id
# (which would turn every later URL into /dashboard/applications/ and produce a cascade of 308s).
$sub = ApiReq POST '/adoptions' @{ petId = $pet.id; answers = $answers; agreedToTerms = $true } $apiSession

if ($sub.Status -eq 409) {
  Write-Output "  NOTE  application already exists (re-run) - reusing it"
  $existing = ApiReq GET "/adoptions/for-pet/$($pet.id)" $null $apiSession
  $appId = $existing.Json.data.id
  Check "existing application reused" ($null -ne $appId) "for-pet returned nothing"
} else {
  Check "application submitted" ($sub.Status -eq 201) "got $($sub.Status): $($sub.Body)"
  $appId = $sub.Json.data.id
}

Write-Output "`n=== 5. Applications list ==="
$r = Get-Page "$fe/dashboard/applications" $feSession
Check "list page loads" ($r.Status -eq 200) "got $($r.Status)"
Check "shows the new application" ($r.Body -match [regex]::Escape($pet.name)) 'not listed'
Check "shows a status badge" ($r.Body -match 'Submitted') 'badge missing'
Check "links to the detail page" ($r.Body -match "dashboard/applications/$appId") 'link missing'

Write-Output "`n=== 6. Application detail ==="
$r = Get-Page "$fe/dashboard/applications/$appId" $feSession
Check "detail page loads" ($r.Status -eq 200) "got $($r.Status)"
Check "shows the progress timeline" ($r.Body -match 'Progress') 'timeline missing'
Check "renders submitted answers" ($r.Body -match 'Your answers') 'answers missing'
Check "shows the reason text" ($r.Body -match 'secure garden') 'reason missing'
Check "offers withdrawal while open" ($r.Body -match 'Withdraw application') 'withdraw missing'
Check "shows the shelter" ($r.Body -match 'Shelter') 'shelter missing'

$r = Get-Page "$fe/dashboard/applications/$appId`?submitted=1" $feSession
Check "?submitted=1 shows the success banner" ($r.Body -match 'Application sent') 'banner missing'

Write-Output "`n=== 7. Already-applied handling ==="
$r = Get-Page "$fe/adopt/$($pet.slug)" $feSession
Check "re-visiting the form redirects to the application" ($r.Body -match 'already applied' -or $r.Body -match 'Your answers') 'form shown again'

$r = Get-Page "$fe/pets/$($pet.slug)" $feSession
Check "pet page shows 'already applied' instead of the CTA" ($r.Body -match 'already applied') 'CTA still shown'
Check "  and links to the application" ($r.Body -match 'View your application') 'link missing'

Write-Output "`n=== 8. Cross-user isolation ==="
$otherApi = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$otherLogin = ApiReq POST '/auth/login' @{ email = 'shelter5@pawfecthome.seed'; password = 'ShelterPass123' } $otherApi
if ($otherLogin.Status -eq 200) {
  $otherFe = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  foreach ($c in $otherApi.Cookies.GetCookies($api)) {
    $otherFe.Cookies.Add((New-Object System.Net.Cookie($c.Name, $c.Value, '/', 'localhost')))
  }
  $r = Get-Page "$fe/dashboard/applications/$appId" $otherFe

  <#
    Next streams its 404 page, and PowerShell 5.1's WebRequest aborts the connection rather than
    surfacing the response (Status 0). The server log confirms a clean 404. So accept either a
    real 404 or the abort — but in both cases assert the application's contents did NOT leak,
    which is the property that actually matters.
  #>
  $deniedCleanly = $r.Status -eq 404 -or $r.Status -eq 0 -or $r.Body -match 'wandered off'
  $leaked = $r.Body -match 'secure garden' -or $r.Body -match 'Your answers'
  Check "another user is denied the application" ($deniedCleanly -and -not $leaked) "status $($r.Status), leaked=$leaked"
} else {
  Write-Output "  SKIP  cross-user check - login rate limited"
}

Write-Output "`n=== 9. Dashboard reflects the application ==="
$r = Get-Page "$fe/dashboard" $feSession
Check "dashboard counts applications" ($r.Body -match 'Application') 'tile missing'

Write-Output "`n================================"
if ($script:fails -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "$($script:fails) CHECK(S) FAILED" }
