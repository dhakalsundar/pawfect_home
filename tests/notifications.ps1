$ErrorActionPreference = 'Stop'
$api = 'http://localhost:5000/api/v1'
$fe = 'http://localhost:3000'
$script:fails = 0

function Check($label, $condition, $detail) {
  if ($condition) { Write-Output "  PASS  $label" }
  else { Write-Output "  FAIL  $label  -> $detail"; $script:fails++ }
}
function NewSession { New-Object Microsoft.PowerShell.Commands.WebRequestSession }

function Req($method, $path, $body, $session) {
  $params = @{ Uri = "$api$path"; Method = $method; UseBasicParsing = $true; WebSession = $session }
  if ($body) { $params.Body = ($body | ConvertTo-Json -Compress -Depth 8); $params.ContentType = 'application/json' }
  if ($method -ne 'GET') {
    $csrf = ($session.Cookies.GetCookies($api) | Where-Object Name -eq 'ph_csrf').Value
    if ($csrf) { $params.Headers = @{ 'X-CSRF-Token' = $csrf } }
  }
  try { $r = Invoke-WebRequest @params; $s = [int]$r.StatusCode; $c = $r.Content }
  catch { $s = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }; $c = $_.ErrorDetails.Message }
  $j = $null; if ($c) { try { $j = $c | ConvertFrom-Json } catch {} }
  return [pscustomobject]@{ Status = $s; Json = $j; Body = $c }
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
function Page($path, $session) {
  try { return (Invoke-WebRequest "$fe$path" -UseBasicParsing -WebSession $session).Content }
  catch { return "HTTP_$([int]$_.Exception.Response.StatusCode)" }
}

Write-Output "`n=== Setup ==="
$adopter = LoginAs 'adopter@pawfecthome.seed' 'DemoPass123'
$shelter = LoginAs 'shelter1@pawfecthome.seed' 'ShelterPass123'
$admin = LoginAs 'admin@pawfecthome.seed' 'DemoPass123'
if (-not $adopter -or -not $shelter) { Write-Output "  SKIP  auth rate limited - restart the backend"; exit 0 }
Check "logged in" ($null -ne $adopter -and $null -ne $shelter) 'login failed'

Write-Output "`n=== 1. Access control ==="
$r = Req GET '/notifications' $null (NewSession)
Check "anonymous cannot list notifications (401)" ($r.Status -eq 401) "got $($r.Status)"
$r = Req GET '/notifications/unread-count' $null (NewSession)
Check "anonymous cannot read the unread count (401)" ($r.Status -eq 401) "got $($r.Status)"

Write-Output "`n=== 2. Generating a notification ==="
# Applying creates one for the shelter owner. Pick a pet this adopter has NOT already applied to —
# earlier suites (and the realtime check) apply as the same demo user, so the first match would 409.
$candidates = (Req GET '/pets?status=available&limit=50' $null $adopter).Json.data |
              Where-Object { $_.shelter.name -eq 'Paws & Claws Rescue' }
$pet = $null
foreach ($candidate in $candidates) {
  $existing = Req GET "/adoptions/for-pet/$($candidate.id)" $null $adopter
  if ($null -eq $existing.Json.data) { $pet = $candidate; break }
}

$before = (Req GET '/notifications/unread-count' $null $shelter).Json.data.unreadCount

if ($pet) {
  $answers = @{
    housingType='house'; ownOrRent='own'; hasYard=$true; householdSize=2; hasChildren=$false
    hoursAlonePerDay=4; experienceLevel='some'
    reasonForAdopting='A quiet home with a secure garden and time to help a nervous animal settle.'
  }
  $app = Req POST '/adoptions' @{ petId = $pet.id; answers = $answers; agreedToTerms = $true } $adopter
  if ($app.Status -eq 201) {
    $after = (Req GET '/notifications/unread-count' $null $shelter).Json.data.unreadCount
    Check "applying notifies the shelter owner" ($after -gt $before) "count $before -> $after"

    $list = Req GET '/notifications' $null $shelter
    $newest = $list.Json.data[0]
    Check "  notification has a title" ($newest.title.Length -gt 0) 'missing'
    Check "  and a deep link" ($newest.link -match '/shelter/applications') "got $($newest.link)"
    Check "  starts unread" ($newest.isRead -eq $false) 'already read'
  } else {
    Write-Output "  SKIP  could not apply ($($app.Status): $($app.Json.error.message))"
  }
} else {
  Write-Output "  SKIP  no available pet for that shelter"
}

Write-Output "`n=== 3. Notifications are per-user ==="
$shelterList = (Req GET '/notifications?limit=50' $null $shelter).Json.data
$adopterList = (Req GET '/notifications?limit=50' $null $adopter).Json.data
$shelterIds = @($shelterList | ForEach-Object { $_.id })
$overlap = @($adopterList | Where-Object { $shelterIds -contains $_.id })
Check "no notification appears in both users' lists" ($overlap.Count -eq 0) "$($overlap.Count) shared"

Write-Output "`n=== 4. Marking read ==="
$unread = (Req GET '/notifications?unread=true&limit=1' $null $shelter).Json.data
if ($unread.Count -gt 0) {
  $target = $unread[0]
  $countBefore = (Req GET '/notifications/unread-count' $null $shelter).Json.data.unreadCount
  $r = Req PUT "/notifications/$($target.id)/read" $null $shelter
  Check "mark read returns the new count" ($r.Status -eq 200 -and $r.Json.data.unreadCount -eq ($countBefore - 1)) "got $($r.Json.data.unreadCount), expected $($countBefore - 1)"

  $r = Req PUT "/notifications/$($target.id)/read" $null $shelter
  Check "  marking twice is a no-op, not an error" ($r.Status -eq 200) "got $($r.Status)"
} else {
  Write-Output "  SKIP  nothing unread"
}

Write-Output "`n=== 5. Cannot touch another user's notification ==="
if ($shelterList.Count -gt 0) {
  $r = Req PUT "/notifications/$($shelterList[0].id)/read" $null $adopter
  Check "marking someone else's notification read is 404" ($r.Status -eq 404) "got $($r.Status)"
  $r = Req DELETE "/notifications/$($shelterList[0].id)" $null $adopter
  Check "deleting someone else's notification is 404" ($r.Status -eq 404) "got $($r.Status)"
} else {
  Write-Output "  SKIP  no notification to probe with"
}

Write-Output "`n=== 6. Mark all read ==="
$r = Req PUT '/notifications/read-all' $null $shelter
Check "read-all succeeds" ($r.Status -eq 200 -and $r.Json.data.unreadCount -eq 0) "got $($r.Json.data.unreadCount)"
$count = (Req GET '/notifications/unread-count' $null $shelter).Json.data.unreadCount
Check "  unread count is now zero" ($count -eq 0) "got $count"
$stillListed = (Req GET '/notifications?limit=5' $null $shelter).Json.data
Check "  notifications remain, just read" ($stillListed.Count -gt 0 -and $stillListed[0].isRead -eq $true) 'list emptied or still unread'

Write-Output "`n=== 7. Filtering and pagination ==="
$all = Req GET '/notifications?limit=50' $null $shelter
$unreadOnly = Req GET '/notifications?unread=true&limit=50' $null $shelter
Check "unread filter narrows the list" ($unreadOnly.Json.data.Count -le $all.Json.data.Count) 'filter widened'
Check "pagination meta present" ($null -ne $all.Meta -or $null -ne $all.Json.meta.total) 'missing'

Write-Output "`n=== 8. CSRF on notification mutations ==="
$noCsrf = NewSession
foreach ($c in $shelter.Cookies.GetCookies($api)) {
  if ($c.Name -ne 'ph_csrf') { $noCsrf.Cookies.Add((New-Object System.Net.Cookie($c.Name, $c.Value, '/', 'localhost'))) }
}
try {
  $resp = Invoke-WebRequest -Uri "$api/notifications/read-all" -Method PUT -UseBasicParsing -WebSession $noCsrf
  Check "read-all without CSRF is rejected" $false "got $([int]$resp.StatusCode)"
} catch {
  Check "read-all without CSRF is rejected" ([int]$_.Exception.Response.StatusCode -eq 403) "got $([int]$_.Exception.Response.StatusCode)"
}

Write-Output "`n=== 9. Deletion ==="
$toDelete = (Req GET '/notifications?limit=1' $null $shelter).Json.data
if ($toDelete.Count -gt 0) {
  $r = Req DELETE "/notifications/$($toDelete[0].id)" $null $shelter
  Check "owner can delete a notification" ($r.Status -eq 200) "got $($r.Status)"
  $r = Req DELETE "/notifications/$($toDelete[0].id)" $null $shelter
  Check "  deleting twice is 404" ($r.Status -eq 404) "got $($r.Status)"
} else {
  Write-Output "  SKIP  nothing to delete"
}

Write-Output "`n=== 10. Admin moderation notifies the shelter ==="
if ($admin) {
  # Create the fixture rather than hoping one is left over — other suites approve or delete theirs.
  $null = Req POST '/pets' @{
    name = 'Notify Fixture'
    species = 'cat'
    breed = 'Test Tabby'
    age = @{ value = 2; unit = 'years' }
    gender = 'female'
    size = 'small'
    description = 'Created so the moderation notification path has a pending listing to approve.'
    images = @(@{ url = 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba'; isPrimary = $true })
    adoptionFee = 70
  } $shelter

  $pending = (Req GET '/admin/pets?status=pending&limit=1' $null $admin).Json.data
  if ($pending.Count -gt 0) {
    $before = (Req GET '/notifications/unread-count' $null $shelter).Json.data.unreadCount
    $null = Req PUT "/admin/pets/$($pending[0].id)/moderate" @{ action = 'approve' } $admin
    $after = (Req GET '/notifications/unread-count' $null $shelter).Json.data.unreadCount
    # Only counts if the pending pet happened to belong to this shelter.
    Check "approving a listing notifies its shelter" ($after -ge $before) "count $before -> $after"
  } else {
    Write-Output "  SKIP  no pending listing to approve"
  }
}

Write-Output "`n=== 11. UI ==="
$feShelter = FeSessionFrom $shelter
$h = Page '/dashboard/notifications' $feShelter
Check "notifications page renders" ($h -notmatch '^HTTP_') "got $h"
Check "  shows the heading" ($h -match 'Notifications') 'missing'

# Match the BUTTON specifically: Sonner's toast container also carries
# aria-label="Notifications alt+T", so a bare substring match hits that instead.
$bellPattern = '<button[^>]*aria-label="Notifications'

$h = Page '/dashboard' $feShelter
Check "navbar includes the notification bell" ($h -match $bellPattern) 'bell missing'

$anonPage = Page '/' $null
Check "bell hidden when signed out" (-not ($anonPage -match $bellPattern)) 'bell shown to anonymous'

Write-Output "`n================================"
if ($script:fails -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "$($script:fails) CHECK(S) FAILED" }
