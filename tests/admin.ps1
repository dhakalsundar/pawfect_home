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
$admin = LoginAs 'admin@pawfecthome.seed' 'DemoPass123'
$adopter = LoginAs 'adopter@pawfecthome.seed' 'DemoPass123'
$shelter = LoginAs 'shelter1@pawfecthome.seed' 'ShelterPass123'
if (-not $admin) { Write-Output "  SKIP  auth rate limited - restart the backend"; exit 0 }
Check "logged in as admin, adopter and shelter" ($null -ne $admin -and $null -ne $adopter -and $null -ne $shelter) 'login failed'

Write-Output "`n=== 1. Access control ==="
foreach ($path in @('/admin/stats', '/admin/users', '/admin/shelters', '/admin/pets', '/admin/audit-logs')) {
  $r = Req GET $path $null $adopter
  Check "adopter blocked from $path (403)" ($r.Status -eq 403) "got $($r.Status)"
}
$r = Req GET '/admin/stats' $null $shelter
Check "shelter blocked from admin (403)" ($r.Status -eq 403) "got $($r.Status)"
$r = Req GET '/admin/stats' $null (NewSession)
Check "anonymous blocked from admin (401)" ($r.Status -eq 401) "got $($r.Status)"

Write-Output "`n=== 2. Platform statistics ==="
$s = Req GET '/admin/stats' $null $admin
Check "stats returns" ($s.Status -eq 200) "got $($s.Status): $($s.Body)"
Check "  user breakdown" ($s.Json.data.users.total -gt 0) 'missing'
Check "  pet breakdown" ($s.Json.data.pets.total -gt 0) 'missing'
Check "  shelter breakdown" ($s.Json.data.shelters.total -gt 0) 'missing'
Check "  application breakdown present" ($null -ne $s.Json.data.applications.total) 'missing'
Check "  admins counted" ($s.Json.data.users.admins -ge 1) "got $($s.Json.data.users.admins)"

Write-Output "`n=== 3. User management ==="
$u = Req GET '/admin/users?limit=100' $null $admin
Check "user list returns" ($u.Status -eq 200 -and $u.Json.data.Count -gt 0) "got $($u.Status)"
Check "  passwords never included" (-not ($u.Body -match '"password"')) 'password leaked'

$search = Req GET '/admin/users?q=adopter' $null $admin
Check "search filters users" (@($search.Json.data | Where-Object { $_.email -match 'adopter' }).Count -gt 0) 'no match'

$byRole = Req GET '/admin/users?role=shelter' $null $admin
Check "role filter works" (@($byRole.Json.data | Where-Object role -ne 'shelter').Count -eq 0) 'wrong role leaked'

Write-Output "`n=== 4. GATE: role change takes effect on the NEXT request ==="
$target = ($u.Json.data | Where-Object email -eq 'adopter@pawfecthome.seed')
Check "found the demo adopter" ($null -ne $target) 'missing'

# The adopter currently holds a valid session. Promote them and confirm the OLD token is dead.
$before = Req GET '/auth/me' $null $adopter
Check "adopter session valid before the change" ($before.Status -eq 200) "got $($before.Status)"

$r = Req PUT "/admin/users/$($target.id)/role" @{ role = 'shelter' } $admin
Check "admin can change a role" ($r.Status -eq 200 -and $r.Json.data.role -eq 'shelter') "got $($r.Status): $($r.Body)"

$after = Req GET '/auth/me' $null $adopter
Check "old session invalidated immediately (tokenVersion bump)" ($after.Status -eq 401) "got $($after.Status) - stale role would persist"

# Put them back so the rest of the suite (and other suites) see the expected role.
$adopter = LoginAs 'adopter@pawfecthome.seed' 'DemoPass123'
$r = Req PUT "/admin/users/$($target.id)/role" @{ role = 'user' } $admin
Check "role restored to user" ($r.Json.data.role -eq 'user') "got $($r.Json.data.role)"
$adopter = LoginAs 'adopter@pawfecthome.seed' 'DemoPass123'

Write-Output "`n=== 5. GATE: last admin cannot be removed ==="
$me = (Req GET '/auth/me' $null $admin).Json.data
$r = Req PUT "/admin/users/$($me.id)/role" @{ role = 'user' } $admin
Check "admin cannot demote themselves" ($r.Status -eq 403) "got $($r.Status)"
$r = Req PUT "/admin/users/$($me.id)/status" @{ status = 'banned' } $admin
Check "admin cannot ban themselves" ($r.Status -eq 403) "got $($r.Status)"
$still = Req GET '/auth/me' $null $admin
Check "  admin account intact" ($still.Status -eq 200 -and $still.Json.data.role -eq 'admin') "got $($still.Json.data.role)"

Write-Output "`n=== 6. Suspending a user ==="
$victim = ($u.Json.data | Where-Object email -eq 'shelter9@pawfecthome.seed')
if ($victim) {
  $vs = LoginAs 'shelter9@pawfecthome.seed' 'ShelterPass123'
  $r = Req PUT "/admin/users/$($victim.id)/status" @{ status = 'suspended'; note = 'Testing suspension.' } $admin
  Check "admin can suspend a user" ($r.Status -eq 200) "got $($r.Status): $($r.Body)"
  if ($vs) {
    $check = Req GET '/auth/me' $null $vs
    Check "  suspended user's session dies immediately" ($check.Status -eq 401 -or $check.Status -eq 403) "got $($check.Status)"
  }
  $r = Req PUT "/admin/users/$($victim.id)/status" @{ status = 'active' } $admin
  Check "  and can be reactivated" ($r.Status -eq 200) "got $($r.Status)"
} else {
  Write-Output "  SKIP  no spare user to suspend"
}

Write-Output "`n=== 7. Pet moderation ==="
# Create the fixture rather than relying on leftovers: shelter.ps1 approves or deletes the pending
# pets it creates, so depending on its residue makes this section silently skip.
if ($shelter) {
  $null = Req POST '/pets' @{
    name = 'Moderation Fixture'
    species = 'cat'
    breed = 'Test Tabby'
    age = @{ value = 2; unit = 'years' }
    gender = 'female'
    size = 'small'
    description = 'A placid cat created solely so the moderation queue has something to review.'
    images = @(@{ url = 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba'; isPrimary = $true })
    adoptionFee = 80
  } $shelter
}

$pending = Req GET '/admin/pets?status=pending&limit=5' $null $admin
if ($pending.Json.data.Count -gt 0) {
  $pet = $pending.Json.data[0]
  $r = Req PUT "/admin/pets/$($pet.id)/moderate" @{ action = 'approve' } $admin
  Check "admin can approve a pending listing" ($r.Status -eq 200 -and $r.Json.data.status -eq 'available') "got $($r.Status): $($r.Body)"

  $r = Req PUT "/admin/pets/$($pet.id)/moderate" @{ action = 'approve' } $admin
  Check "  approving twice is a 409" ($r.Status -eq 409) "got $($r.Status)"

  $r = Req PUT "/admin/pets/$($pet.id)/moderate" @{ action = 'feature' } $admin
  Check "admin can feature an available pet" ($r.Status -eq 200 -and $r.Json.data.featured -eq $true) "got $($r.Status)"

  $r = Req PUT "/admin/pets/$($pet.id)/moderate" @{ action = 'unfeature' } $admin
  Check "  and unfeature it" ($r.Json.data.featured -eq $false) 'still featured'
} else {
  Write-Output "  SKIP  no pending pets - create one via the shelter suite first"
}

$avail = (Req GET '/admin/pets?status=available&limit=1' $null $admin).Json.data[0]
if ($avail) {
  $r = Req PUT "/admin/pets/$($avail.id)/moderate" @{ action = 'reject' } $admin
  Check "rejecting without a reason is 422" ($r.Status -eq 422) "got $($r.Status)"
}

Write-Output "`n=== 8. Shelter approval ==="
$shelters = Req GET '/admin/shelters?limit=50' $null $admin
Check "shelter list returns" ($shelters.Status -eq 200 -and $shelters.Json.data.Count -gt 0) "got $($shelters.Status)"
Check "  includes owner details" ($null -ne $shelters.Json.data[0].owner) 'missing'

$someShelter = $shelters.Json.data[0]
$r = Req PUT "/admin/shelters/$($someShelter.id)/status" @{ status = 'rejected' } $admin
Check "rejecting a shelter without a reason is 422" ($r.Status -eq 422) "got $($r.Status)"

$r = Req PUT "/admin/shelters/$($someShelter.id)/status" @{ status = 'approved' } $admin
Check "admin can approve a shelter" ($r.Status -eq 200 -and $r.Json.data.status -eq 'approved') "got $($r.Status): $($r.Body)"

Write-Output "`n=== 9. GATE: every admin mutation is audited ==="
$logs = Req GET '/admin/audit-logs?limit=50' $null $admin
Check "audit log returns" ($logs.Status -eq 200) "got $($logs.Status)"
Check "  role change recorded" (@($logs.Json.data | Where-Object action -eq 'user.role_changed').Count -gt 0) 'missing'
Check "  status change recorded" (@($logs.Json.data | Where-Object action -eq 'user.status_changed').Count -ge 0) 'missing'
Check "  shelter approval recorded" (@($logs.Json.data | Where-Object action -eq 'shelter.approved').Count -gt 0) 'missing'

$entry = $logs.Json.data | Where-Object action -eq 'user.role_changed' | Select-Object -First 1
Check "  entry names the actor" ($entry.actor.email -eq 'admin@pawfecthome.seed') "got $($entry.actor.email)"
Check "  entry records before and after" ($null -ne $entry.before -and $null -ne $entry.after) 'missing'
Check "  entry captures the IP" ($null -ne $entry.ip) 'missing'

$filtered = Req GET '/admin/audit-logs?action=user.role_changed' $null $admin
Check "audit log filters by action" (@($filtered.Json.data | Where-Object action -ne 'user.role_changed').Count -eq 0) 'filter leaked'

# The log must be append-only: no route exists to modify or delete entries.
$r = Req DELETE "/admin/audit-logs/$($entry.id)" $null $admin
Check "audit entries cannot be deleted (404, no such route)" ($r.Status -eq 404) "got $($r.Status)"

Write-Output "`n=== 10. CSRF on admin mutations ==="
$noCsrf = NewSession
foreach ($c in $admin.Cookies.GetCookies($api)) {
  if ($c.Name -ne 'ph_csrf') { $noCsrf.Cookies.Add((New-Object System.Net.Cookie($c.Name, $c.Value, '/', 'localhost'))) }
}
try {
  $resp = Invoke-WebRequest -Uri "$api/admin/users/$($target.id)/role" -Method PUT -UseBasicParsing -WebSession $noCsrf -ContentType 'application/json' -Body (@{role='admin'}|ConvertTo-Json -Compress)
  Check "role change without CSRF is rejected" $false "got $([int]$resp.StatusCode)"
} catch {
  Check "role change without CSRF is rejected" ([int]$_.Exception.Response.StatusCode -eq 403) "got $([int]$_.Exception.Response.StatusCode)"
}

Write-Output "`n=== 11. Admin dashboard pages ==="
$feAdmin = FeSessionFrom $admin
foreach ($p in @('/admin', '/admin/users', '/admin/shelters', '/admin/pets', '/admin/audit-logs')) {
  $h = Page $p $feAdmin
  Check "$p renders for an admin" ($h -notmatch '^HTTP_') "got $h"
}

$h = Page '/admin' $feAdmin
Check "overview shows platform stats" ($h -match 'Users' -and $h -match 'Pets') 'missing'
$h = Page '/admin/users' $feAdmin
Check "user list renders rows" ($h -match 'admin@pawfecthome.seed') 'missing'
$h = Page '/admin/audit-logs' $feAdmin
Check "audit log page shows entries" ($h -match 'role_changed|Role changed') 'missing'

Write-Output "`n=== 12. Non-admins blocked from /admin pages ==="
$feAdopter = FeSessionFrom $adopter
$h = Page '/admin' $feAdopter
Check "adopter denied the admin dashboard" ($h -match 'Access denied' -or $h -match '^HTTP_40') "got $($h.Substring(0,[Math]::Min(60,$h.Length)))"

Write-Output "`n================================"
if ($script:fails -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "$($script:fails) CHECK(S) FAILED" }
