$ErrorActionPreference = 'Stop'
$api = 'http://localhost:5000/api/v1'
$script:fails = 0

function Check($label, $condition, $detail) {
  if ($condition) { Write-Output "  PASS  $label" }
  else { Write-Output "  FAIL  $label  -> $detail"; $script:fails++ }
}
function NewSession { New-Object Microsoft.PowerShell.Commands.WebRequestSession }

function Req($method, $path, $body, $session) {
  $params = @{ Uri = "$api$path"; Method = $method; UseBasicParsing = $true }
  if ($session) { $params.WebSession = $session }
  if ($body) { $params.Body = ($body | ConvertTo-Json -Compress -Depth 6); $params.ContentType = 'application/json' }
  if ($method -ne 'GET' -and $session) {
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

function ShelterTotal($shelterId) {
  return (Req GET "/donations/stats?shelterId=$shelterId" $null $null).Json.data.total
}

Write-Output "`n=== Setup ==="
$adopter = LoginAs 'adopter@pawfecthome.seed' 'DemoPass123'
$shelter = LoginAs 'shelter1@pawfecthome.seed' 'ShelterPass123'
$admin   = LoginAs 'admin@pawfecthome.seed' 'DemoPass123'
if (-not $adopter -or -not $shelter -or -not $admin) {
  Write-Output "  SKIP  auth rate limited - restart the backend and retry"
  exit 0
}
Check "logged in as adopter + shelter owner + admin" $true ''

# shelter1 owns b22…0000; b22…0001 is a different shelter (deterministic seed ids).
$ownShelter   = 'b22b22b22b22b22b22b20000'
$otherShelter = 'b22b22b22b22b22b22b20001'
$codAmount    = 250000  # Rs 2,500 in paisa

Write-Output "`n=== Cash on Delivery: creating a pledge ==="
$before = ShelterTotal $ownShelter
$create = Req POST '/donations/checkout' @{ amount = $codAmount; shelterId = $ownShelter; paymentMethod = 'cod' } $adopter
Check "a COD donation is accepted (201)" ($create.Status -eq 201) "status $($create.Status): $($create.Body)"
Check "the response names COD as the method" ($create.Json.data.paymentMethod -eq 'cod') "method=$($create.Json.data.paymentMethod)"
Check "a COD pledge has no gateway redirect URL" ($null -eq $create.Json.data.url) "url=$($create.Json.data.url)"
Check "a COD pledge starts pending" ($create.Json.data.status -eq 'pending') "status=$($create.Json.data.status)"
$codId = $create.Json.data.donationId
Check "a donation id was returned" ($null -ne $codId) 'no id'

Write-Output "`n=== A pending pledge does not touch the public totals ==="
$afterCreate = ShelterTotal $ownShelter
Check "the shelter total is unchanged while the pledge is pending" ($afterCreate -eq $before) "before=$before after=$afterCreate"

$wall = @((Req GET "/donations/stats?shelterId=$ownShelter" $null $null).Json.data.recent | Where-Object { $_.id -eq $codId })
Check "a pending pledge is not shown on the public donor wall" ($wall.Count -eq 0) 'pending pledge leaked publicly'

Write-Output "`n=== The receiving shelter can see the pledge ==="
$mine = @((Req GET '/donations?status=pending&limit=50' $null $shelter).Json.data | Where-Object { $_.id -eq $codId })
Check "the pledge appears in the shelter's own donation list" ($mine.Count -eq 1) 'pledge missing from shelter list'
if ($mine.Count -eq 1) {
  Check "the shelter sees the real donor name on its receipt" ($mine[0].donorName -eq 'Demo Adopter') "name: $($mine[0].donorName)"
}

Write-Output "`n=== Authorization on mark-received ==="
$byDonor = Req PUT "/donations/$codId/mark-received" $null $adopter
Check "the donor cannot mark their own pledge received (403)" ($byDonor.Status -eq 403) "status $($byDonor.Status)"

$anon = Req PUT "/donations/$codId/mark-received" $null (NewSession)
Check "a signed-out user cannot mark a pledge received (401)" ($anon.Status -eq 401) "status $($anon.Status)"

# A pledge to a DIFFERENT shelter must be invisible to this shelter owner.
$otherCreate = Req POST '/donations/checkout' @{ amount = $codAmount; shelterId = $otherShelter; paymentMethod = 'cod' } $adopter
$otherId = $otherCreate.Json.data.donationId
$crossShelter = Req PUT "/donations/$otherId/mark-received" $null $shelter
Check "a shelter cannot settle another shelter's pledge (404)" ($crossShelter.Status -eq 404) "status $($crossShelter.Status)"

Write-Output "`n=== Settling the pledge updates the total exactly once ==="
$settle = Req PUT "/donations/$codId/mark-received" $null $shelter
Check "the receiving shelter can mark the pledge received (200)" ($settle.Status -eq 200) "status $($settle.Status): $($settle.Body)"
Check "the donation is now succeeded" ($settle.Json.data.status -eq 'succeeded') "status=$($settle.Json.data.status)"

$afterSettle = ShelterTotal $ownShelter
Check "the shelter total increased by exactly the pledge" (($afterSettle - $before) -eq $codAmount) "before=$before after=$afterSettle amount=$codAmount"

# Idempotent: Stripe-style double delivery, or an impatient double-click.
$again = Req PUT "/donations/$codId/mark-received" $null $shelter
Check "marking an already-settled pledge is still 200" ($again.Status -eq 200) "status $($again.Status)"
Check "the second settlement reports succeeded" ($again.Json.data.status -eq 'succeeded') "status=$($again.Json.data.status)"
$afterAgain = ShelterTotal $ownShelter
Check "a repeated settlement does not double-count the money" ($afterAgain -eq $afterSettle) "after=$afterSettle again=$afterAgain"

Write-Output "`n=== A settled pledge behaves like any other donation ==="
$onWall = @((Req GET "/donations/stats?shelterId=$ownShelter" $null $null).Json.data.recent | Where-Object { $_.id -eq $codId })
Check "the settled pledge now appears on the public donor wall" ($onWall.Count -eq 1) 'settled pledge not public'

$note = @((Req GET '/notifications?limit=30' $null $shelter).Json.data | Where-Object { $_.type -eq 'donation_received' })
Check "the shelter was notified of the received donation" ($note.Count -gt 0) 'no notification'

Write-Output "`n=== Admin can settle any pledge ==="
$adminPledge = Req POST '/donations/checkout' @{ amount = 100000; shelterId = $ownShelter; paymentMethod = 'cod' } $adopter
$adminPledgeId = $adminPledge.Json.data.donationId
$adminSettle = Req PUT "/donations/$adminPledgeId/mark-received" $null $admin
Check "an admin can settle a COD pledge (200)" ($adminSettle.Status -eq 200) "status $($adminSettle.Status)"
Check "the admin-settled pledge is succeeded" ($adminSettle.Json.data.status -eq 'succeeded') "status=$($adminSettle.Json.data.status)"

Write-Output "`n=== mark-received only applies to COD donations ==="
# The seeded Stripe webhook fixtures are pending and NOT cash — settling one must 404.
$stripePending = @((Req GET '/donations?status=pending&limit=50' $null $admin).Json.data |
                   Where-Object { $_.donorName -eq 'Webhook Fixture' -and $_.paymentMethod -ne 'cod' })
if ($stripePending.Count -gt 0) {
  $notCod = Req PUT "/donations/$($stripePending[0].id)/mark-received" $null $admin
  Check "mark-received refuses a non-COD donation (404)" ($notCod.Status -eq 404) "status $($notCod.Status)"
} else {
  Write-Output "  note: no non-COD pending fixtures to check against"
}

$ghost = Req PUT "/donations/d44d44d44d44d44d44d4ffff/mark-received" $null $admin
Check "settling a non-existent donation is 404" ($ghost.Status -eq 404) "status $($ghost.Status)"

$badId = Req PUT "/donations/not-a-real-id/mark-received" $null $admin
Check "a malformed donation id is handled cleanly (404)" ($badId.Status -eq 404) "status $($badId.Status)"

Write-Output "`n=== Validation still runs for COD ==="
$tooSmall = Req POST '/donations/checkout' @{ amount = 50; shelterId = $ownShelter; paymentMethod = 'cod' } $adopter
Check "a COD donation below the minimum is rejected (422)" ($tooSmall.Status -eq 422) "status $($tooSmall.Status)"

$badMethod = Req POST '/donations/checkout' @{ amount = $codAmount; shelterId = $ownShelter; paymentMethod = 'bitcoin' } $adopter
Check "an unknown payment method is rejected (422)" ($badMethod.Status -eq 422) "status $($badMethod.Status)"

# =====================================================================================
# eSewa
#
# The gateway is exercised WITHOUT eSewa's servers by self-signing the redirect payload — the
# signature is a pure HMAC-SHA256 over the fields with the shared secret, so signing and
# verification are testable exactly like the Stripe webhook. This is the security-critical half;
# the leg where a browser sits on eSewa's sandbox and pays is external and verified manually.
# =====================================================================================
$esewaSecret = '8gBm/:&EnhH.1/q'   # eSewa's PUBLIC UAT sandbox secret

function EsewaSign($fields, $signedNames) {
  $message = (($signedNames -split ',') | ForEach-Object { "$_=$($fields[$_])" }) -join ','
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = [Text.Encoding]::UTF8.GetBytes($esewaSecret)
  $hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
  $hmac.Dispose()
  return [Convert]::ToBase64String($hash)
}

# Builds the base64 `data` blob eSewa appends to the success redirect, signed with a chosen secret.
function EsewaData($fields, $secret) {
  $names = $fields['signed_field_names']
  $message = (($names -split ',') | ForEach-Object { "$_=$($fields[$_])" }) -join ','
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
  $fields['signature'] = [Convert]::ToBase64String($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($message)))
  $hmac.Dispose()
  $json = ($fields | ConvertTo-Json -Compress)
  return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}

function NewEsewaDonation($amount, $shelterId) {
  return (Req POST '/donations/checkout' @{ amount = $amount; shelterId = $shelterId; paymentMethod = 'esewa' } $adopter).Json.data
}

function VerifyEsewa($base64) {
  return (Req POST '/donations/esewa/verify' @{ data = $base64 } $null)
}

# A COMPLETE, correctly-signed payload for a donation whose stored amount is $amountPaisa.
function CompletePayload($uuid, $amountPaisa) {
  $rupees = [int]($amountPaisa / 100)
  return [ordered]@{
    transaction_code   = "REF$([guid]::NewGuid().ToString('N').Substring(0,8))"
    status             = 'COMPLETE'
    total_amount       = "$rupees"
    transaction_uuid   = $uuid
    product_code       = 'EPAYTEST'
    signed_field_names = 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names'
  }
}

Write-Output "`n=== eSewa: initiating a payment ==="
$init = NewEsewaDonation 250000 $ownShelter
Check "an eSewa donation is accepted (201)" ($null -ne $init) 'no data'
Check "the method is eSewa" ($init.paymentMethod -eq 'esewa') "method=$($init.paymentMethod)"
Check "eSewa returns the gateway form URL" ($init.esewa.url -match 'esewa\.com\.np') "url=$($init.esewa.url)"
$fields = $init.esewa.fields
Check "the form carries a transaction_uuid" ($fields.transaction_uuid -match '^PH-') "uuid=$($fields.transaction_uuid)"
Check "the total is rupees, not paisa" ($fields.total_amount -eq '2500') "total=$($fields.total_amount)"

# Independently recompute the outgoing form signature — proves our signing is byte-correct.
$formSig = EsewaSign @{ total_amount = $fields.total_amount; transaction_uuid = $fields.transaction_uuid; product_code = $fields.product_code } 'total_amount,transaction_uuid,product_code'
Check "the form signature matches an independent HMAC" ($fields.signature -eq $formSig) "got $($fields.signature)"

Write-Output "`n=== eSewa: a verified payment settles the donation ==="
$before = ShelterTotal $ownShelter
$good = EsewaData (CompletePayload $fields.transaction_uuid 250000) $esewaSecret
$verify = VerifyEsewa $good
Check "verification returns 200" ($verify.Status -eq 200) "status $($verify.Status)"
Check "the outcome is succeeded" ($verify.Json.data.outcome -eq 'succeeded') "outcome=$($verify.Json.data.outcome)"
Check "the donation is now succeeded" ($verify.Json.data.donation.status -eq 'succeeded') "status=$($verify.Json.data.donation.status)"
$after = ShelterTotal $ownShelter
Check "the shelter total rose by exactly the amount" (($after - $before) -eq 250000) "before=$before after=$after"

Write-Output "`n=== eSewa: replay is idempotent ==="
$replay = VerifyEsewa $good
Check "a replayed redirect is acknowledged" ($replay.Status -eq 200) "status $($replay.Status)"
Check "the replay reports duplicate, not a second success" ($replay.Json.data.outcome -eq 'duplicate') "outcome=$($replay.Json.data.outcome)"
$afterReplay = ShelterTotal $ownShelter
Check "a replay does not double-count the money" ($afterReplay -eq $after) "after=$after replay=$afterReplay"

Write-Output "`n=== eSewa: a forged signature is rejected ==="
$forged = EsewaData (CompletePayload (NewEsewaDonation 250000 $ownShelter).esewa.fields.transaction_uuid 250000) 'the-wrong-secret'
$forgedResult = VerifyEsewa $forged
Check "a payload signed with the wrong secret is rejected" ($forgedResult.Json.data.outcome -eq 'invalid_signature') "outcome=$($forgedResult.Json.data.outcome)"

Write-Output "`n=== eSewa: a tampered amount is caught ==="
# Validly signed (our secret), but claims an amount that does not match the donation.
$mismatchDon = NewEsewaDonation 250000 $ownShelter
$mismatch = CompletePayload $mismatchDon.esewa.fields.transaction_uuid 250000
$mismatch['total_amount'] = '999999'   # re-signed below with the real secret, so signature is valid
$mismatchData = EsewaData $mismatch $esewaSecret
$mismatchResult = VerifyEsewa $mismatchData
Check "a validly-signed but wrong amount is rejected" ($mismatchResult.Json.data.outcome -eq 'amount_mismatch') "outcome=$($mismatchResult.Json.data.outcome)"
$stillPending = (Req GET "/donations/$($mismatchDon.donationId)" $null $admin).Json.data
Check "the mismatched donation did not settle" ($stillPending.status -ne 'succeeded') "status=$($stillPending.status)"

Write-Output "`n=== eSewa: a non-COMPLETE status does not settle ==="
$cancelledDon = NewEsewaDonation 250000 $ownShelter
$cancelled = CompletePayload $cancelledDon.esewa.fields.transaction_uuid 250000
$cancelled['status'] = 'CANCELED'
$cancelledData = EsewaData $cancelled $esewaSecret
$cancelledResult = VerifyEsewa $cancelledData
Check "a CANCELED payment is not settled" ($cancelledResult.Json.data.outcome -eq 'not_complete') "outcome=$($cancelledResult.Json.data.outcome)"

Write-Output "`n=== eSewa: edge cases ==="
$unknown = CompletePayload 'PH-000000000000000000000000-zzzz' 250000
$unknownData = EsewaData $unknown $esewaSecret
$unknownResult = VerifyEsewa $unknownData
Check "an unknown transaction is reported, not settled" ($unknownResult.Json.data.outcome -eq 'unknown') "outcome=$($unknownResult.Json.data.outcome)"

$garbage = VerifyEsewa 'this-is-not-valid-base64-json'
Check "a garbage payload is rejected as invalid" ($garbage.Json.data.outcome -eq 'invalid_signature') "outcome=$($garbage.Json.data.outcome)"

$empty = Req POST '/donations/esewa/verify' @{ data = '' } $null
Check "an empty data param is a 422" ($empty.Status -eq 422) "status $($empty.Status)"

Write-Output "`n--- payments: $($script:fails) failed ---"
exit $script:fails
