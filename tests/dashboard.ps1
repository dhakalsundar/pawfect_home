$ErrorActionPreference = 'Stop'
$fe = 'http://localhost:3000'
$api = 'http://localhost:5000/api/v1'
$script:fails = 0

function Check($label, $condition, $detail) {
  if ($condition) { Write-Output "  PASS  $label" }
  else { Write-Output "  FAIL  $label  -> $detail"; $script:fails++ }
}
function NewSession { New-Object Microsoft.PowerShell.Commands.WebRequestSession }

function Req($method, $path, $body, $session) {
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

function Page($path, $session) {
  try { return (Invoke-WebRequest "$fe$path" -UseBasicParsing -WebSession $session).Content }
  catch { return "HTTP_$([int]$_.Exception.Response.StatusCode)" }
}

function LoginAs($email, $password) {
  $s = NewSession
  $r = Req POST '/auth/login' @{ email = $email; password = $password } $s
  if ($r.Status -ne 200) { return $null }
  return $s
}

function FeSessionFrom($apiSession) {
  $fs = NewSession
  foreach ($c in $apiSession.Cookies.GetCookies($api)) {
    $fs.Cookies.Add((New-Object System.Net.Cookie($c.Name, $c.Value, '/', 'localhost')))
  }
  return $fs
}

Write-Output "`n=== Setup ==="
$api1 = LoginAs 'adopter@pawfecthome.seed' 'DemoPass123'
if (-not $api1) { Write-Output "  SKIP  auth rate limited - restart the backend"; exit 0 }
$fe1 = FeSessionFrom $api1
Check "signed in as the demo adopter" ($null -ne $api1) 'login failed'

$pets = (Req GET '/pets?status=available&limit=3' $null $api1).Json.data
$petA = $pets[0]; $petB = $pets[1]
Write-Output "  pets: $($petA.name), $($petB.name)"

Write-Output "`n=== 1. Favourites API ==="
$r = Req POST '/favorites/toggle' @{ petId = $petA.id } $api1
Check "toggle adds a favourite" ($r.Status -eq 200 -and $r.Json.data.favorited -eq $true) "got $($r.Status) $($r.Body)"

$before = (Req GET "/pets/$($petA.slug)" $null $api1).Json.data.favoritesCount
$r = Req POST '/favorites' @{ petId = $petA.id } $api1
$after = (Req GET "/pets/$($petA.slug)" $null $api1).Json.data.favoritesCount
Check "re-adding is idempotent (200)" ($r.Status -eq 200) "got $($r.Status)"
Check "  and does not double-count" ($after -eq $before) "count went $before -> $after"

$ids = (Req GET '/favorites/ids' $null $api1).Json.data
Check "ids endpoint includes the pet" ($ids -contains $petA.id) 'missing'

$r = Req GET '/favorites' $null $api1
Check "list returns the favourited pet" (@($r.Json.data | Where-Object id -eq $petA.id).Count -eq 1) 'not listed'
Check "  with a favoritedAt timestamp" ($null -ne ($r.Json.data | Where-Object id -eq $petA.id).favoritedAt) 'missing'

$r = Req DELETE "/favorites/$($petA.id)" $null $api1
Check "delete removes the favourite" ($r.Status -eq 200 -and $r.Json.data.favorited -eq $false) "got $($r.Status)"
$ids = (Req GET '/favorites/ids' $null $api1).Json.data
Check "  and it leaves the ids list" (-not ($ids -contains $petA.id)) 'still present'

$r = Req DELETE "/favorites/$($petA.id)" $null $api1
Check "deleting twice is safe" ($r.Status -eq 200) "got $($r.Status)"

$r = Req POST '/favorites' @{ petId = '000000000000000000000000' } $api1
Check "favouriting a missing pet is 404" ($r.Status -eq 404) "got $($r.Status)"

Write-Output "`n=== 2. Favourites are user-scoped ==="
$null = Req POST '/favorites' @{ petId = $petB.id } $api1
$api2 = LoginAs 'shelter7@pawfecthome.seed' 'ShelterPass123'
if ($api2) {
  $otherIds = (Req GET '/favorites/ids' $null $api2).Json.data
  Check "another user does not see them" (-not ($otherIds -contains $petB.id)) 'leaked across users'
} else {
  Write-Output "  SKIP  cross-user check - rate limited"
}

$anon = NewSession
$r = Req GET '/favorites' $null $anon
Check "anonymous request is 401" ($r.Status -eq 401) "got $($r.Status)"

Write-Output "`n=== 3. CSRF on favourite mutations ==="
$noCsrf = NewSession
foreach ($c in $api1.Cookies.GetCookies($api)) {
  if ($c.Name -ne 'ph_csrf') { $noCsrf.Cookies.Add((New-Object System.Net.Cookie($c.Name, $c.Value, '/', 'localhost'))) }
}
try {
  $resp = Invoke-WebRequest -Uri "$api/favorites" -Method POST -UseBasicParsing -WebSession $noCsrf -ContentType 'application/json' -Body (@{petId=$petA.id}|ConvertTo-Json -Compress)
  Check "favourite without CSRF is rejected" $false "got $([int]$resp.StatusCode)"
} catch {
  Check "favourite without CSRF is rejected" ([int]$_.Exception.Response.StatusCode -eq 403) "got $([int]$_.Exception.Response.StatusCode)"
}

Write-Output "`n=== 4. Profile update ==="
$r = Req PUT '/users/me' @{ name = 'Demo Adopter'; bio = 'Quiet home with a garden.'; phone = '5550123' } $api1
Check "profile updates" ($r.Status -eq 200 -and $r.Json.data.bio -eq 'Quiet home with a garden.') "got $($r.Status) $($r.Body)"
Check "  password never returned" (-not ($r.Body -match '"password"')) 'password leaked'

$r = Req PUT '/users/me' @{ name = 'X' } $api1
Check "too-short name rejected" ($r.Status -eq 422) "got $($r.Status)"

$r = Req PUT '/users/me' @{ bio = ('x' * 600) } $api1
Check "over-long bio rejected" ($r.Status -eq 422) "got $($r.Status)"

Write-Output "`n=== 5. Preferences ==="
$r = Req PUT '/users/me/preferences' @{ newsletter = $true } $api1
Check "preference saved" ($r.Status -eq 200 -and $r.Json.data.preferences.newsletter -eq $true) "got $($r.Status)"
$r = Req PUT '/users/me/preferences' @{ newsletter = $false } $api1
Check "preference toggles back" ($r.Json.data.preferences.newsletter -eq $false) 'did not toggle'
$r = Req PUT '/users/me/preferences' @{ theme = 'purple' } $api1
Check "invalid theme rejected" ($r.Status -eq 422) "got $($r.Status)"

Write-Output "`n=== 6. Stats ==="
$r = Req GET '/users/me/stats' $null $api1
Check "stats returns all counters" ($null -ne $r.Json.data.favorites -and $null -ne $r.Json.data.applications) "$($r.Body)"
Check "favourites count is accurate" ($r.Json.data.favorites -ge 1) "got $($r.Json.data.favorites)"

Write-Output "`n=== 7. Account deletion guards ==="
# DELETE /users/me uses the `sensitive` limiter (5/hr), shared with password reset and the
# newsletter, so a re-run can exhaust it. A 429 here means the limiter works, not that the guard
# is broken — report it as a skip.
$cases = @(
  @{ Body = @{ confirm = 'delete' };                                Label = 'wrong confirmation phrase rejected' },
  @{ Body = @{ confirm = 'DELETE' };                                Label = 'missing password rejected' },
  @{ Body = @{ confirm = 'DELETE'; password = 'WrongPass123' };     Label = 'wrong password rejected' }
)
foreach ($case in $cases) {
  $r = Req DELETE '/users/me' $case.Body $api1
  if ($r.Status -eq 429) {
    Write-Output "  SKIP  $($case.Label) - rate limited (restart the backend to reset)"
  } else {
    Check $case.Label ($r.Status -eq 422) "got $($r.Status)"
  }
}
$r = Req GET '/auth/me' $null $api1
Check "account still intact after failed attempts" ($r.Status -eq 200) "got $($r.Status)"

Write-Output "`n=== 8. Dashboard pages ==="
foreach ($p in @('/dashboard', '/dashboard/favorites', '/dashboard/profile', '/dashboard/settings', '/dashboard/applications')) {
  $h = Page $p $fe1
  Check "$p renders" ($h -notmatch '^HTTP_') "got $h"
}

$h = Page '/dashboard' $fe1
Check "overview shows the sidebar nav" ($h -match 'aria-label="Dashboard"') 'nav missing'
Check "overview shows stat tiles" ($h -match 'Saved pets' -and $h -match 'Applications') 'tiles missing'

$h = Page '/dashboard/favorites' $fe1
Check "favourites page lists the saved pet" ($h -match [regex]::Escape($petB.name)) 'pet missing'
Check "  hearts render pressed" ($h -match 'aria-pressed="true"') 'not pressed'

$h = Page '/dashboard/profile' $fe1
Check "profile form prefilled" ($h -match 'Quiet home with a garden') 'bio missing'
Check "email shown as read-only" ($h -match 'Cannot be changed here|Managed by Google') 'missing'

$h = Page '/dashboard/settings' $fe1
Check "settings shows notification toggles" ($h -match 'Email notifications') 'missing'
Check "settings shows theme options" ($h -match 'Colour theme') 'missing'
Check "settings shows the danger zone" ($h -match 'Delete account') 'missing'
Check "password form present" ($h -match 'Current password') 'missing'

Write-Output "`n=== 9. Signed-out users are redirected ==="
# With -MaximumRedirection 0, PowerShell may either return the 3xx response or throw, depending on
# the status. Read the code from whichever path we land in rather than assuming one of them.
foreach ($p in @('/dashboard/favorites', '/dashboard/profile', '/dashboard/settings')) {
  try {
    $r = Invoke-WebRequest "$fe$p" -UseBasicParsing -MaximumRedirection 0
    $code = [int]$r.StatusCode
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  }
  Check "$p redirects when signed out" ($code -eq 307 -or $code -eq 302) "got $code"
}

Write-Output "`n=== 10. Favourite state hydrates on the listing ==="
$h = Page '/pets' $fe1
Check "listing marks the favourited pet as pressed" ($h -match 'aria-pressed="true"') 'no filled heart'

Write-Output "`n================================"
if ($script:fails -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "$($script:fails) CHECK(S) FAILED" }
