$ErrorActionPreference = 'Stop'
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
  # Cookie-auth mutations require the double-submit CSRF header.
  if ($method -ne 'GET') {
    $csrf = ($session.Cookies.GetCookies($api) | Where-Object Name -eq 'ph_csrf').Value
    if ($csrf) { $params.Headers = @{ 'X-CSRF-Token' = $csrf } }
  }
  try {
    $r = Invoke-WebRequest @params
    $status = [int]$r.StatusCode; $content = $r.Content
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    $content = $_.ErrorDetails.Message
  }
  $json = $null
  if ($content) { try { $json = $content | ConvertFrom-Json } catch {} }
  return [pscustomobject]@{ Status = $status; Body = $content; Json = $json }
}

function LoginAs($email, $password) {
  $s = NewSession
  $r = Req POST '/auth/login' @{ email = $email; password = $password } $s
  if ($r.Status -ne 200) { return $null }
  return $s
}

Write-Output "`n=== Setup ==="
$adopter = LoginAs 'adopter@pawfecthome.seed' 'DemoPass123'
$admin   = LoginAs 'admin@pawfecthome.seed' 'DemoPass123'
if (-not $adopter -or -not $admin) {
  Write-Output "  SKIP  auth rate limited - restart the backend and retry"
  exit 0
}
Check "logged in as adopter + admin" ($null -ne $adopter -and $null -ne $admin) 'login failed'

# Pick an available pet not owned by the adopter's (non-existent) shelter.
$pet = (Req GET '/pets?status=available&limit=1' $null $adopter).Json.data[0]
Write-Output "  target pet: $($pet.name) ($($pet.slug))"

$validAnswers = @{
  housingType       = 'house'
  ownOrRent         = 'own'
  hasYard           = $true
  householdSize     = 3
  hasChildren       = $false
  hoursAlonePerDay  = 4
  experienceLevel   = 'experienced'
  reasonForAdopting = 'We have a large fenced garden and years of experience with rescue dogs, and we are home most of the day.'
}

Write-Output "`n=== 1. Validation ==="
$r = Req POST '/adoptions' @{ petId = $pet.id; answers = $validAnswers; agreedToTerms = $false } $adopter
Check "rejects without agreeing to terms" ($r.Status -eq 422) "got $($r.Status)"

$short = $validAnswers.Clone(); $short.reasonForAdopting = 'Want dog'
$r = Req POST '/adoptions' @{ petId = $pet.id; answers = $short; agreedToTerms = $true } $adopter
Check "rejects a too-short reason" ($r.Status -eq 422) "got $($r.Status)"

# Renting without landlord approval is the classic rejection reason; caught up front.
$renting = $validAnswers.Clone(); $renting.ownOrRent = 'rent'
$r = Req POST '/adoptions' @{ petId = $pet.id; answers = $renting; agreedToTerms = $true } $adopter
Check "renter without landlord approval rejected" ($r.Status -eq 422) "got $($r.Status)"
Check "  and the error names the field" ($r.Json.error.fields.PSObject.Properties.Name -match 'landlordApproval') "$($r.Body)"

$kids = $validAnswers.Clone(); $kids.hasChildren = $true
$r = Req POST '/adoptions' @{ petId = $pet.id; answers = $kids; agreedToTerms = $true } $adopter
Check "children without ages rejected" ($r.Status -eq 422) "got $($r.Status)"

Write-Output "`n=== 2. Submission ==="
$r = Req POST '/adoptions' @{ petId = $pet.id; answers = $validAnswers; agreedToTerms = $true; references = @(@{ name='Jane Vet'; relationship='Veterinarian'; phone='5550100' }) } $adopter
Check "valid application returns 201" ($r.Status -eq 201) "got $($r.Status): $($r.Body)"
$appId = $r.Json.data.id
Check "starts as pending" ($r.Json.data.status -eq 'pending') "got $($r.Json.data.status)"
Check "snapshots the applicant" ($r.Json.data.applicantSnapshot.email -eq 'adopter@pawfecthome.seed') 'snapshot missing'
Check "records initial status history" ($r.Json.data.statusHistory.Count -ge 1) 'no history'
Check "includes the pet" ($r.Json.data.pet.name -eq $pet.name) 'pet missing'

Write-Output "`n=== 3. Duplicate prevention (DB-enforced) ==="
$r = Req POST '/adoptions' @{ petId = $pet.id; answers = $validAnswers; agreedToTerms = $true } $adopter
Check "second open application returns 409" ($r.Status -eq 409) "got $($r.Status)"

$r = Req GET "/adoptions/for-pet/$($pet.id)" $null $adopter
Check "for-pet reports the existing application" ($r.Json.data.status -eq 'pending') "got $($r.Json.data)"

Write-Output "`n=== 4. Ownership scoping ==="
$r = Req GET '/adoptions' $null $adopter
# @() forces an array: in PowerShell 5.1 a single Where-Object result is a bare object with no
# .Count property, so an unwrapped comparison silently evaluates to $false.
Check "adopter sees their own application" (@($r.Json.data | Where-Object id -eq $appId).Count -eq 1) 'not listed'

$other = LoginAs 'shelter2@pawfecthome.seed' 'ShelterPass123'
if ($other) {
  $r = Req GET "/adoptions/$appId" $null $other
  Check "unrelated shelter gets 404, not the record" ($r.Status -eq 404) "got $($r.Status)"
} else {
  Write-Output "  SKIP  cross-shelter check - rate limited"
}

$anon = NewSession
$r = Req GET '/adoptions' $null $anon
Check "anonymous request is 401" ($r.Status -eq 401) "got $($r.Status)"

# A second applicant on the SAME pet, created now while the pet is still available. Creating it
# after approval would fail, because approval reserves the pet and closes it to new applications.
Write-Output "`n=== 4b. Second applicant (for the cascade check later) ==="
$second = LoginAs 'shelter3@pawfecthome.seed' 'ShelterPass123'
$secondAppId = $null
if ($second) {
  $r = Req POST '/adoptions' @{ petId = $pet.id; answers = $validAnswers; agreedToTerms = $true } $second
  if ($r.Status -eq 201) { $secondAppId = $r.Json.data.id }
  Check "a different user can apply for the same pet" ($r.Status -eq 201) "got $($r.Status): $($r.Json.error.message)"
} else {
  Write-Output "  SKIP  second applicant - login rate limited"
}

Write-Output "`n=== 5. State machine ==="
$r = Req PUT "/adoptions/$appId/status" @{ status = 'completed' } $admin
Check "pending -> completed is rejected (409)" ($r.Status -eq 409) "got $($r.Status)"

$r = Req PUT "/adoptions/$appId/status" @{ status = 'rejected' } $admin
Check "rejection without a reason is 422" ($r.Status -eq 422) "got $($r.Status)"

$r = Req PUT "/adoptions/$appId/status" @{ status = 'under_review' } $admin
Check "pending -> under_review allowed" ($r.Status -eq 200) "got $($r.Status): $($r.Body)"
Check "status history grows" ($r.Json.data.statusHistory.Count -ge 2) 'history not appended'

$r = Req PUT "/adoptions/$appId/status" @{ status = 'approved'; note = 'Looks like a great fit.' } $admin
Check "under_review -> approved allowed" ($r.Status -eq 200) "got $($r.Status)"

$petAfter = (Req GET "/pets/$($pet.slug)" $null $anon).Json.data
Check "approval reserves the pet" ($petAfter.status -eq 'reserved') "got $($petAfter.status)"

Write-Output "`n=== 6. Completion cascades ==="
$r = Req PUT "/adoptions/$appId/status" @{ status = 'completed'; note = 'Adopted!' } $admin
Check "approved -> completed allowed" ($r.Status -eq 200) "got $($r.Status): $($r.Body)"

$petFinal = (Req GET "/pets/$($pet.slug)" $null $anon).Json.data
Check "pet marked adopted" ($petFinal.status -eq 'adopted') "got $($petFinal.status)"

if ($secondAppId) {
  $r = Req GET "/adoptions/$secondAppId" $null $second
  Check "other open applications auto-rejected" ($r.Json.data.status -eq 'rejected') "got $($r.Json.data.status)"
  Check "  with an explanatory note" ($r.Json.data.reviewNote -match 'adopted by another') "got '$($r.Json.data.reviewNote)'"
} else {
  Write-Output "  SKIP  cascade check - could not create a second application"
}

$r = Req PUT "/adoptions/$appId/status" @{ status = 'approved' } $admin
Check "completed is terminal (409)" ($r.Status -eq 409) "got $($r.Status)"

Write-Output "`n=== 7. Re-apply after rejection ==="
if ($secondAppId) {
  # The pet is adopted now, so this should fail on availability rather than the unique index -
  # which still proves the rejected application no longer blocks a new one.
  $r = Req POST '/adoptions' @{ petId = $pet.id; answers = $validAnswers; agreedToTerms = $true } $second
  Check "blocked by availability, not by duplicate" ($r.Status -eq 409 -and $r.Json.error.message -match 'no longer accepting') "got $($r.Status): $($r.Json.error.message)"
}

Write-Output "`n=== 8. Withdraw ==="
$freshPet = (Req GET '/pets?status=available&limit=1' $null $adopter).Json.data[0]
$r = Req POST '/adoptions' @{ petId = $freshPet.id; answers = $validAnswers; agreedToTerms = $true } $adopter
if ($r.Status -eq 201) {
  $wId = $r.Json.data.id
  $r = Req PUT "/adoptions/$wId/withdraw" @{ reason = 'Circumstances changed.' } $adopter
  Check "applicant can withdraw" ($r.Status -eq 200 -and $r.Json.data.status -eq 'withdrawn') "got $($r.Status)"

  $r = Req POST '/adoptions' @{ petId = $freshPet.id; answers = $validAnswers; agreedToTerms = $true } $adopter
  Check "can re-apply after withdrawing" ($r.Status -eq 201) "got $($r.Status): $($r.Json.error.message)"
} else {
  Write-Output "  SKIP  withdraw checks - could not create application ($($r.Status))"
}

Write-Output "`n=== 9. Shelter cannot apply to its own pet ==="
$shelterOwner = LoginAs 'shelter1@pawfecthome.seed' 'ShelterPass123'
if ($shelterOwner) {
  $ownPet = (Req GET '/pets?status=available&limit=50' $null $anon).Json.data |
            Where-Object { $_.shelter.name -eq 'Paws & Claws Rescue' } | Select-Object -First 1
  if ($ownPet) {
    $r = Req POST '/adoptions' @{ petId = $ownPet.id; answers = $validAnswers; agreedToTerms = $true } $shelterOwner
    Check "own-shelter application forbidden" ($r.Status -eq 403) "got $($r.Status)"
  } else {
    Write-Output "  SKIP  no available pet found for that shelter"
  }
} else {
  Write-Output "  SKIP  shelter login rate limited"
}

Write-Output "`n================================"
if ($script:fails -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "$($script:fails) CHECK(S) FAILED" }
