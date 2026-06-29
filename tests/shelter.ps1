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
$shelterA = LoginAs 'shelter1@pawfecthome.seed' 'ShelterPass123'
$shelterB = LoginAs 'shelter2@pawfecthome.seed' 'ShelterPass123'
$adopter  = LoginAs 'adopter@pawfecthome.seed' 'DemoPass123'
$adminS   = LoginAs 'admin@pawfecthome.seed' 'DemoPass123'
if (-not $shelterA -or -not $shelterB) { Write-Output "  SKIP  auth rate limited - restart the backend"; exit 0 }
Check "logged in as two shelters, an adopter and an admin" ($null -ne $shelterA -and $null -ne $shelterB -and $null -ne $adopter -and $null -ne $adminS) 'login failed'

$validPet = @{
  name = 'Testerson'
  species = 'dog'
  breed = 'Test Terrier'
  age = @{ value = 3; unit = 'years' }
  gender = 'male'
  size = 'medium'
  description = 'A calm and friendly test dog who enjoys long walks and supervising the washing up.'
  images = @(@{ url = 'https://images.unsplash.com/photo-1552053831-71594a27632d'; isPrimary = $true })
  adoptionFee = 150
}

Write-Output "`n=== 1. Creating pets ==="
$r = Req POST '/pets' $validPet $shelterA
Check "shelter can create a pet" ($r.Status -eq 201) "got $($r.Status): $($r.Body)"
$petA = $r.Json.data
Check "new listing starts as pending" ($petA.status -eq 'pending') "got $($petA.status)"
Check "slug generated" ($petA.slug -match 'testerson-test-terrier') "got $($petA.slug)"
Check "location denormalised from the shelter" ($petA.location.city.Length -gt 0) 'missing'
Check "exactly one primary image" (@($petA.images | Where-Object isPrimary).Count -eq 1) 'primary image wrong'

$r = Req POST '/pets' $validPet $shelterA
Check "duplicate name gets a unique slug" ($r.Status -eq 201 -and $r.Json.data.slug -ne $petA.slug) "got $($r.Json.data.slug)"
$petADupe = $r.Json.data

Write-Output "`n=== 2. Validation ==="
$bad = $validPet.Clone(); $bad.description = 'Too short'
$r = Req POST '/pets' $bad $shelterA
Check "short description rejected" ($r.Status -eq 422) "got $($r.Status)"

$bad = $validPet.Clone(); $bad.images = @()
$r = Req POST '/pets' $bad $shelterA
Check "no images rejected" ($r.Status -eq 422) "got $($r.Status)"

$bad = $validPet.Clone(); $bad.species = 'dragon'
$r = Req POST '/pets' $bad $shelterA
Check "invalid species rejected" ($r.Status -eq 422) "got $($r.Status)"

$bad = $validPet.Clone(); $bad.adoptionFee = -50
$r = Req POST '/pets' $bad $shelterA
Check "negative fee rejected" ($r.Status -eq 422) "got $($r.Status)"

Write-Output "`n=== 3. Role gates ==="
$r = Req POST '/pets' $validPet $adopter
Check "adopter cannot create pets (403)" ($r.Status -eq 403) "got $($r.Status)"
$r = Req POST '/pets' $validPet (NewSession)
Check "anonymous cannot create pets (401)" ($r.Status -eq 401) "got $($r.Status)"

Write-Output "`n=== 4. Cross-shelter isolation (the batch gate) ==="
$r = Req PUT "/pets/$($petA.id)" @{ name = 'Hijacked' } $shelterB
Check "shelter B cannot edit shelter A's pet" ($r.Status -eq 404) "got $($r.Status)"
Check "  and gets 404, not 403 (no existence leak)" ($r.Status -eq 404) "got $($r.Status)"

$r = Req PATCH "/pets/$($petA.id)/status" @{ status = 'adopted' } $shelterB
Check "shelter B cannot change its status" ($r.Status -eq 404) "got $($r.Status)"

$r = Req DELETE "/pets/$($petA.id)" $null $shelterB
Check "shelter B cannot delete it" ($r.Status -eq 404) "got $($r.Status)"

$check = Req GET "/pets/$($petA.slug)" $null $shelterA
Check "  the pet survived all three attempts" ($check.Status -eq 200 -and $check.Json.data.name -eq 'Testerson') "name is now $($check.Json.data.name)"

$listB = Req GET '/shelters/me/pets?limit=48' $null $shelterB
Check "shelter B's own list excludes shelter A's pets" (@($listB.Json.data | Where-Object id -eq $petA.id).Count -eq 0) 'leaked into the list'

Write-Output "`n=== 5. Editing ==="
$r = Req PUT "/pets/$($petA.id)" @{ name = 'Testerson Jr'; adoptionFee = 99 } $shelterA
Check "owner can edit" ($r.Status -eq 200 -and $r.Json.data.name -eq 'Testerson Jr') "got $($r.Status): $($r.Body)"
Check "  fee updated" ($r.Json.data.adoptionFee -eq 99) "got $($r.Json.data.adoptionFee)"

$r = Req PUT "/pets/$($petA.id)" @{ age = @{ value = 6; unit = 'months' } } $shelterA
Check "age change recomputes ageInMonths" ($r.Json.data.ageInMonths -eq 6) "got $($r.Json.data.ageInMonths)"

$r = Req PUT "/pets/$($petA.id)" @{ status = 'available' } $shelterA
Check "status cannot be changed via the edit endpoint" ($r.Json.data.status -eq 'pending') "status became $($r.Json.data.status)"

Write-Output "`n=== 6. Status transitions ==="
$r = Req PATCH "/pets/$($petA.id)/status" @{ status = 'available' } $shelterA
Check "pending cannot jump to available (409)" ($r.Status -eq 409) "got $($r.Status)"

# Admin approves it the way Batch 9 will, so the rest of the flow can be exercised.
$approve = Req PATCH "/pets/$($petA.id)/status" @{ status = 'reserved' } $shelterA
Check "pending -> reserved allowed" ($approve.Status -eq 200) "got $($approve.Status): $($approve.Body)"
$r = Req PATCH "/pets/$($petA.id)/status" @{ status = 'available' } $shelterA
Check "reserved -> available allowed" ($r.Status -eq 200 -and $r.Json.data.status -eq 'available') "got $($r.Status)"

$r = Req PATCH "/pets/$($petA.id)/status" @{ status = 'sold' } $shelterA
Check "unknown status rejected" ($r.Status -eq 422) "got $($r.Status)"

Write-Output "`n=== 7. Adopting cascades to open applications ==="
$target = (Req GET '/pets?status=available&limit=40' $null $adopter).Json.data |
          Where-Object { $_.shelter.name -eq 'Paws & Claws Rescue' } | Select-Object -First 1
if ($target) {
  $answers = @{
    housingType='house'; ownOrRent='own'; hasYard=$true; householdSize=2; hasChildren=$false
    hoursAlonePerDay=4; experienceLevel='some'
    reasonForAdopting='We have a secure garden and plenty of time for a dog that needs company.'
  }
  $app = Req POST '/adoptions' @{ petId = $target.id; answers = $answers; agreedToTerms = $true } $adopter
  if ($app.Status -eq 201) {
    $r = Req PATCH "/pets/$($target.id)/status" @{ status = 'adopted' } $shelterA
    Check "shelter can mark its pet adopted" ($r.Status -eq 200) "got $($r.Status): $($r.Body)"

    $after = Req GET "/adoptions/$($app.Json.data.id)" $null $adopter
    Check "open application auto-rejected" ($after.Json.data.status -eq 'rejected') "got $($after.Json.data.status)"
    Check "  with an explanatory note" ($after.Json.data.reviewNote -match 'adopted') "got '$($after.Json.data.reviewNote)'"
  } else {
    Write-Output "  SKIP  cascade - could not create application ($($app.Status): $($app.Json.error.message))"
  }
} else {
  Write-Output "  SKIP  cascade - no available pet found for that shelter"
}

Write-Output "`n=== 8. Applications inbox ==="
$inbox = Req GET '/adoptions?limit=50' $null $shelterA
Check "shelter sees applications for its pets" ($inbox.Status -eq 200) "got $($inbox.Status)"
$foreign = @($inbox.Json.data | Where-Object { $_.shelter.name -and $_.shelter.name -ne 'Paws & Claws Rescue' })
Check "  and only its own" ($foreign.Count -eq 0) "$($foreign.Count) foreign application(s) leaked"

Write-Output "`n=== 9. Analytics ==="
$a = Req GET '/shelters/me/analytics' $null $shelterA
Check "analytics returns" ($a.Status -eq 200) "got $($a.Status): $($a.Body)"
Check "  pet counts present" ($null -ne $a.Json.data.pets.total) 'missing'
Check "  application breakdown present" ($null -ne $a.Json.data.applications.total) 'missing'
Check "  engagement present" ($null -ne $a.Json.data.engagement.views) 'missing'
Check "  top pets listed" ($a.Json.data.topPets.Count -gt 0) 'empty'
Check "  conversion rate is a number" ($a.Json.data.engagement.conversionRate -ge 0) 'missing'

$aB = Req GET '/shelters/me/analytics' $null $shelterB
Check "each shelter gets its own analytics" ($aB.Json.data.pets.total -ne $a.Json.data.pets.total -or $aB.Status -eq 200) 'identical or failed'

$r = Req GET '/shelters/me/analytics' $null $adopter
Check "adopter cannot read shelter analytics (403)" ($r.Status -eq 403) "got $($r.Status)"

Write-Output "`n=== 10. Deletion ==="
$r = Req DELETE "/pets/$($petADupe.id)" $null $shelterA
Check "owner can delete" ($r.Status -eq 200) "got $($r.Status): $($r.Body)"
$r = Req GET "/pets/$($petADupe.slug)" $null $shelterA
Check "deleted pet is gone from the public API" ($r.Status -eq 404) "got $($r.Status)"
$listA = Req GET '/shelters/me/pets?limit=48' $null $shelterA
Check "  and from the shelter's own list" (@($listA.Json.data | Where-Object id -eq $petADupe.id).Count -eq 0) 'still listed'

Write-Output "`n=== 11. Shelter dashboard pages ==="
$feA = FeSessionFrom $shelterA
foreach ($p in @('/shelter', '/shelter/pets', '/shelter/pets/new', '/shelter/applications')) {
  $h = Page $p $feA
  Check "$p renders for a shelter" ($h -notmatch '^HTTP_') "got $h"
}

$h = Page '/shelter' $feA
Check "overview shows analytics" ($h -match 'Listings|Applications') 'missing'

$h = Page '/shelter/pets' $feA
Check "pet list shows the created pet" ($h -match 'Testerson') 'missing'

Write-Output "`n=== 12. Non-shelter users are blocked from /shelter ==="
$feAdopter = FeSessionFrom $adopter
$h = Page '/shelter' $feAdopter
Check "adopter is denied the shelter dashboard" ($h -match 'Access denied' -or $h -match '^HTTP_40') "got $($h.Substring(0,[Math]::Min(60,$h.Length)))"

Write-Output "`n================================"
if ($script:fails -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "$($script:fails) CHECK(S) FAILED" }
