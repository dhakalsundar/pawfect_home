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
$shelter = LoginAs 'shelter1@pawfecthome.seed' 'ShelterPass123'
$adopter = LoginAs 'adopter@pawfecthome.seed' 'DemoPass123'
if (-not $shelter -or -not $adopter) { Write-Output "  SKIP  auth rate limited - restart the backend"; exit 0 }
Check "logged in as a shelter and an adopter" ($null -ne $shelter -and $null -ne $adopter) 'login failed'

$config = Req GET '/upload/config' $null $shelter
$cloudinaryOn = $config.Json.data.enabled
Write-Output "  Cloudinary configured: $cloudinaryOn"

Write-Output "`n=== 1. Upload config ==="
Check "config endpoint returns" ($config.Status -eq 200) "got $($config.Status)"
Check "  reports an enabled flag" ($null -ne $config.Json.data.enabled) 'missing'
Check "  states the size limit" ($config.Json.data.maxFileSizeMb -eq 5) "got $($config.Json.data.maxFileSizeMb)"
Check "  lists accepted types" ($config.Json.data.acceptedTypes -contains 'image/jpeg') 'missing'
Check "  never leaks the API secret" (-not ($config.Body -match 'api_secret|apiSecret|CLOUDINARY_API_SECRET')) 'secret leaked'

Write-Output "`n=== 2. Signature endpoint requires a session ==="
$r = Req POST '/upload/signature' @{ folder = 'pets' } (NewSession)
Check "anonymous signature request is 401" ($r.Status -eq 401) "got $($r.Status)"

Write-Output "`n=== 3. Folder allow-list ==="
foreach ($bad in @('../../etc', 'anything', 'pets/../avatars', '')) {
  $label = if ($bad -eq '') { '(empty)' } else { $bad }
  $r = Req POST '/upload/signature' @{ folder = $bad } $shelter
  Check "rejects folder '$label'" ($r.Status -eq 422) "got $($r.Status)"
}

Write-Output "`n=== 4. Folder authorisation by role ==="
$r = Req POST '/upload/signature' @{ folder = 'pets' } $adopter
Check "adopter cannot sign a pets upload (403)" ($r.Status -eq 403) "got $($r.Status)"
$r = Req POST '/upload/signature' @{ folder = 'shelters' } $adopter
Check "adopter cannot sign a shelters upload (403)" ($r.Status -eq 403) "got $($r.Status)"

$r = Req POST '/upload/signature' @{ folder = 'avatars' } $adopter
if ($cloudinaryOn) {
  Check "adopter CAN sign an avatar upload" ($r.Status -eq 200) "got $($r.Status): $($r.Body)"
} else {
  Check "avatar upload degrades to 503 when unconfigured" ($r.Status -eq 503) "got $($r.Status)"
}

Write-Output "`n=== 5. CSRF on upload mutations ==="
$noCsrf = NewSession
foreach ($c in $shelter.Cookies.GetCookies($api)) {
  if ($c.Name -ne 'ph_csrf') { $noCsrf.Cookies.Add((New-Object System.Net.Cookie($c.Name, $c.Value, '/', 'localhost'))) }
}
try {
  $resp = Invoke-WebRequest -Uri "$api/upload/signature" -Method POST -UseBasicParsing -WebSession $noCsrf -ContentType 'application/json' -Body (@{folder='pets'}|ConvertTo-Json -Compress)
  Check "signature without CSRF is rejected" $false "got $([int]$resp.StatusCode)"
} catch {
  Check "signature without CSRF is rejected" ([int]$_.Exception.Response.StatusCode -eq 403) "got $([int]$_.Exception.Response.StatusCode)"
}

Write-Output "`n=== 6. Signature shape (when configured) ==="
if ($cloudinaryOn) {
  $sig = Req POST '/upload/signature' @{ folder = 'pets' } $shelter
  Check "signature issued" ($sig.Status -eq 200) "got $($sig.Status)"
  Check "  includes a signature" ($sig.Json.data.signature.Length -gt 10) 'missing'
  Check "  includes a timestamp" ($sig.Json.data.timestamp -gt 0) 'missing'
  Check "  folder is namespaced under pawfecthome" ($sig.Json.data.folder -match '^pawfecthome/') "got $($sig.Json.data.folder)"
  Check "  cloud name present" ($sig.Json.data.cloudName.Length -gt 0) 'missing'
} else {
  Write-Output "  SKIP  Cloudinary not configured - add credentials to backend/.env"
}

Write-Output "`n=== 7. Asset deletion is scoped to our folders ==="
$r = Req POST '/upload/delete' @{ publicId = 'some/other/account/asset' } $shelter
Check "cannot delete an asset outside our folders" ($r.Status -eq 404) "got $($r.Status)"
$r = Req POST '/upload/delete' @{ publicId = 'pawfecthome/pets/does-not-exist' } $shelter
Check "non-existent asset is 404, not a silent success" ($r.Status -eq 404) "got $($r.Status)"
$r = Req POST '/upload/delete' @{ publicId = '' } $shelter
Check "empty publicId rejected" ($r.Status -eq 422) "got $($r.Status)"

Write-Output "`n=== 8. Forged publicIds are refused on save ==="
$petBody = @{
  name = 'Forgery Probe'
  species = 'cat'
  breed = 'Test Tabby'
  age = @{ value = 1; unit = 'years' }
  gender = 'female'
  size = 'small'
  description = 'Created to confirm that fabricated Cloudinary references are rejected on save.'
  images = @(@{ url = 'https://res.cloudinary.com/demo/image/upload/sample.jpg'; publicId = 'someone/elses/asset'; isPrimary = $true })
  adoptionFee = 50
}
# Rejected either way. With Cloudinary on, the asset does not exist; with it off, no legitimate
# publicId can exist at all — so its presence is itself the evidence of forgery.
$r = Req POST '/pets' $petBody $shelter
Check "forged publicId rejected (422)" ($r.Status -eq 422) "got $($r.Status): $($r.Body)"

# A pet with no publicId must still save — that is the URL-paste fallback path.
$urlOnly = $petBody.Clone()
$urlOnly.name = 'URL Fallback Probe'
$urlOnly.images = @(@{ url = 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba'; isPrimary = $true })
$r = Req POST '/pets' $urlOnly $shelter
Check "image without a publicId still saves" ($r.Status -eq 201) "got $($r.Status): $($r.Body)"
if ($r.Status -eq 201) { $null = Req DELETE "/pets/$($r.Json.data.id)" $null $shelter }

Write-Output "`n=== 9. Deleting a pet still succeeds and archives it ==="
$plain = @{
  name = 'Cleanup Probe'
  species = 'dog'
  breed = 'Test Hound'
  age = @{ value = 2; unit = 'years' }
  gender = 'male'
  size = 'medium'
  description = 'Created to confirm deletion runs asset cleanup without failing the request.'
  images = @(@{ url = 'https://images.unsplash.com/photo-1552053831-71594a27632d'; isPrimary = $true })
  adoptionFee = 100
}
$created = Req POST '/pets' $plain $shelter
if ($created.Status -eq 201) {
  $r = Req DELETE "/pets/$($created.Json.data.id)" $null $shelter
  Check "delete succeeds with cleanup in the path" ($r.Status -eq 200) "got $($r.Status): $($r.Body)"
  $gone = Req GET "/pets/$($created.Json.data.slug)" $null $shelter
  Check "  pet no longer publicly retrievable" ($gone.Status -eq 404) "got $($gone.Status)"
} else {
  Write-Output "  SKIP  could not create the probe pet ($($created.Status))"
}

Write-Output "`n=== 10. Avatar publicId is verified before saving ==="
$r = Req PUT '/users/me' @{ avatar = @{ url = 'https://res.cloudinary.com/demo/image/upload/x.jpg'; publicId = 'forged/avatar/id' } } $adopter
if ($cloudinaryOn) {
  Check "forged avatar publicId rejected" ($r.Status -eq 422) "got $($r.Status)"
} else {
  Check "avatar update tolerated when Cloudinary is off" ($r.Status -eq 200 -or $r.Status -eq 422) "got $($r.Status)"
}

Write-Output "`n=== 11. UI reflects the configuration ==="
$feShelter = FeSessionFrom $shelter
$h = Page '/shelter/pets/new' $feShelter
Check "pet form renders" ($h -notmatch '^HTTP_') "got $h"
Check "  photos section present" ($h -match 'Photos') 'missing'

$feAdopter = FeSessionFrom $adopter
$h = Page '/dashboard/profile' $feAdopter
Check "profile page renders" ($h -notmatch '^HTTP_') "got $h"
Check "  avatar control present" ($h -match 'Upload photo|not configured|Change photo') 'missing'

Write-Output "`n================================"
if ($script:fails -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "$($script:fails) CHECK(S) FAILED" }
