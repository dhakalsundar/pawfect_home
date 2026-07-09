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

# --- Stripe webhook signing -------------------------------------------------
# Stripe signs "<timestamp>.<raw body>" with HMAC-SHA256 and sends
# "t=<timestamp>,v1=<hex>". Reproducing that here is what makes the webhook testable with no
# Stripe account: signature verification is pure HMAC and never touches their API.
$secret = 'whsec_localdevonly_0123456789abcdef0123456789abcdef'

# PaymentIntent ids are scoped to this run. They are the idempotency key, so reusing a literal id
# across runs means run 2 collides with run 1's Payment row and the refund path silently no-ops.
$runId = [guid]::NewGuid().ToString('N').Substring(0, 8)

function SignPayload($payload, $timestamp, $withSecret) {
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = [Text.Encoding]::UTF8.GetBytes($withSecret)
  $signed = "$timestamp.$payload"
  $hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($signed))
  $hmac.Dispose()
  return ($hash | ForEach-Object { $_.ToString('x2') }) -join ''
}

function PostWebhook($payload, $signatureHeader) {
  $params = @{
    Uri = 'http://localhost:5000/api/v1/webhooks/stripe'; Method = 'POST'
    UseBasicParsing = $true; ContentType = 'application/json'; Body = $payload
  }
  if ($null -ne $signatureHeader) { $params.Headers = @{ 'Stripe-Signature' = $signatureHeader } }
  try {
    $r = Invoke-WebRequest @params
    return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $r.Content }
  } catch {
    $s = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    return [pscustomobject]@{ Status = $s; Body = $_.ErrorDetails.Message }
  }
}

function CheckoutCompletedEvent($donationId, $intentId, $amount) {
  # Shaped like the real payload; only the fields the handler reads matter.
  $event = @{
    id = "evt_test_$([guid]::NewGuid().ToString('N').Substring(0,16))"
    object = 'event'; type = 'checkout.session.completed'
    data = @{ object = @{
      id = "cs_test_$([guid]::NewGuid().ToString('N').Substring(0,16))"
      object = 'checkout.session'; payment_status = 'paid'; payment_intent = $intentId
      amount_total = $amount; currency = 'usd'; metadata = @{ donationId = $donationId }
    } }
  }
  return ($event | ConvertTo-Json -Compress -Depth 8)
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

# Deterministic seed id (see stableId in seed.ts): b22… shelters.
$shelterId = 'b22b22b22b22b22b22b20000'

<#
  Webhook fixtures are claimed from the seeded pool at run time, not hard-coded.

  Each one is consumed by being driven to `succeeded`, so hard-coded ids only work on a freshly
  seeded database — the suite would then fail on its second run for reasons that have nothing to
  do with the code. Same lesson as the suites that used to scavenge each other's fixtures.
#>
$pool = @((Req GET '/donations?status=pending&limit=50' $null $admin).Json.data |
          Where-Object { $_.donorName -eq 'Webhook Fixture' })

if ($pool.Count -lt 3) {
  Write-Output "  SKIP  only $($pool.Count) unused webhook fixtures left - restart the backend to reseed"
  exit 0
}
$pending1 = $pool[0].id
$pending2 = $pool[1].id
$pending3 = $pool[2].id
Write-Output "  claimed 3 of $($pool.Count) available webhook fixtures"

Write-Output "`n=== Public stats + donor wall ==="
$stats = (Req GET '/donations/stats' $null $null).Json.data
Check "stats are public (no auth required)" ($null -ne $stats) 'no data returned'
Check "stats report a total in minor units" ($stats.total -gt 0 -and $stats.total -eq [int]$stats.total) "total=$($stats.total)"
Check "stats report a donation count" ($stats.count -ge 24) "count=$($stats.count)"
Check "the donor wall returns recent donations" ($stats.recent.Count -gt 0) 'wall was empty'

$anon = @($stats.recent | Where-Object { $_.isAnonymous })
if ($anon.Count -gt 0) {
  $named = @($anon | Where-Object { $_.donorName -ne 'Anonymous' })
  Check "anonymous donors are masked on the public wall" ($named.Count -eq 0) "$($named.Count) leaked a real name"
} else {
  Write-Output "  note: no anonymous donations in the recent window"
}
$succeededOnly = @($stats.recent | Where-Object { $_.status -ne 'succeeded' })
Check "the wall shows only succeeded donations" ($succeededOnly.Count -eq 0) "$($succeededOnly.Count) non-succeeded rows"

$scoped = (Req GET "/donations/stats?shelterId=$shelterId" $null $null).Json.data
Check "stats can be scoped to one shelter" ($scoped.total -gt 0 -and $scoped.total -le $stats.total) "scoped=$($scoped.total) all=$($stats.total)"

Write-Output "`n=== Amounts are integer paisa (minor units) ==="
$tooSmall = Req POST '/donations/checkout' @{ amount = 50 } $adopter
Check "a donation below Rs. 1 is rejected" ($tooSmall.Status -eq 422) "status $($tooSmall.Status)"

$fractional = Req POST '/donations/checkout' @{ amount = 1999.5 } $adopter
Check "a fractional amount is rejected" ($fractional.Status -eq 422) "status $($fractional.Status)"

$negative = Req POST '/donations/checkout' @{ amount = -5000 } $adopter
Check "a negative amount is rejected" ($negative.Status -eq 422) "status $($negative.Status)"

$huge = Req POST '/donations/checkout' @{ amount = 99999999 } $adopter
Check "an implausibly large amount is rejected" ($huge.Status -eq 422) "status $($huge.Status)"

$asString = Req POST '/donations/checkout' @{ amount = '5000' } $adopter
Check "a string amount is rejected rather than coerced" ($asString.Status -eq 422) "status $($asString.Status)"

Write-Output "`n=== Checkout degrades cleanly without Stripe keys ==="
$checkout = Req POST '/donations/checkout' @{ amount = 5000; shelterId = $shelterId } $adopter
Check "checkout returns 503 while Stripe is unconfigured" ($checkout.Status -eq 503) "status $($checkout.Status): $($checkout.Body)"
Check "the 503 explains itself" ($checkout.Json.error.message -match 'not configured|not available') "message: $($checkout.Json.error.message)"
# Validation must run BEFORE the service, so a bad amount is a 422 even with Stripe absent.
Check "validation still runs ahead of the Stripe check" ($tooSmall.Status -eq 422) 'ordering regressed'

$guest = Req POST '/donations/checkout' @{ amount = 5000 } (NewSession)
Check "a guest without name/email gets a field error, not a 401" ($guest.Status -eq 422) "status $($guest.Status)"
Check "the field error names both missing fields" ($guest.Json.error.fields.donorName -and $guest.Json.error.fields.donorEmail) "fields: $($guest.Json.error.fields | ConvertTo-Json -Compress)"

Write-Output "`n=== Webhook signature verification ==="
$payload = CheckoutCompletedEvent $pending1 "pi_test_${runId}_a" 5000
# NOT `Get-Date -UFormat %s`: in PowerShell 5.1 that returns seconds since the epoch in LOCAL
# time, which on a UTC+05:45 machine puts every timestamp ~5.75 hours in the future. Stripe only
# rejects timestamps that are too OLD, so a future one sails through and the tolerance test
# silently passes nothing.
$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

$noSig = PostWebhook $payload $null
Check "a webhook with no signature is rejected" ($noSig.Status -eq 400) "status $($noSig.Status)"

$badSig = PostWebhook $payload "t=$now,v1=$('0' * 64)"
Check "a webhook with a forged signature is rejected" ($badSig.Status -eq 400) "status $($badSig.Status)"

$wrongSecret = SignPayload $payload $now 'whsec_the_wrong_secret_entirely'
$wrongKey = PostWebhook $payload "t=$now,v1=$wrongSecret"
Check "a signature made with the wrong secret is rejected" ($wrongKey.Status -eq 400) "status $($wrongKey.Status)"

# Sign one payload, send a different one — this is the attack the raw body preserves against.
$validSigForOther = SignPayload $payload $now $secret
$tampered = $payload.Replace('5000', '500000')
$tamperedResult = PostWebhook $tampered "t=$now,v1=$validSigForOther"
Check "a tampered payload fails its own signature" ($tamperedResult.Status -eq 400) "status $($tamperedResult.Status)"

# Correctly signed, but hours old: Stripe's 300-second tolerance is what stops a captured request
# being replayed later. The signature is valid — only the age makes it fail.
$staleTime = $now - 86400
$stale = SignPayload $payload $staleTime $secret
$staleResult = PostWebhook $payload "t=$staleTime,v1=$stale"
Check "a correctly signed but stale event is rejected (tolerance window)" ($staleResult.Status -eq 400) "status $($staleResult.Status)"

Write-Output "`n=== Webhook fulfilment ==="
$before = (Req GET "/donations/stats?shelterId=$shelterId" $null $null).Json.data.total

$goodSig = SignPayload $payload $now $secret
$fulfil = PostWebhook $payload "t=$now,v1=$goodSig"
Check "a correctly signed webhook is accepted" ($fulfil.Status -eq 200) "status $($fulfil.Status): $($fulfil.Body)"

$donation = (Req GET "/donations/$pending1" $null $admin).Json.data
Check "the donation is now succeeded" ($donation.status -eq 'succeeded') "status=$($donation.status)"
Check "the stored amount is unchanged (integer minor units)" ($donation.amount -eq 5000) "amount=$($donation.amount)"

$after = (Req GET "/donations/stats?shelterId=$shelterId" $null $null).Json.data.total
Check "the shelter total increased by exactly the donation" (($after - $before) -eq 5000) "before=$before after=$after"

Write-Output "`n=== Replay creates no duplicate ==="
# Byte-identical redelivery, exactly as Stripe retries it.
$replay = PostWebhook $payload "t=$now,v1=$goodSig"
Check "a replayed webhook is still acknowledged" ($replay.Status -eq 200) "status $($replay.Status)"

$afterReplay = (Req GET "/donations/stats?shelterId=$shelterId" $null $null).Json.data.total
Check "a replay does not double-count the money" ($afterReplay -eq $after) "after=$after afterReplay=$afterReplay"

$stillOne = (Req GET "/donations/stats?shelterId=$shelterId" $null $null).Json.data.count
$replay2 = PostWebhook $payload "t=$now,v1=$goodSig"
$countAfter = (Req GET "/donations/stats?shelterId=$shelterId" $null $null).Json.data.count
Check "a third delivery still creates no extra donation" ($countAfter -eq $stillOne) "before=$stillOne after=$countAfter"

# A different event id carrying the same PaymentIntent — Stripe does this across event types.
$sameIntent = CheckoutCompletedEvent $pending2 "pi_test_${runId}_a" 5000
$sigSame = SignPayload $sameIntent $now $secret
PostWebhook $sameIntent "t=$now,v1=$sigSame" | Out-Null
$other = (Req GET "/donations/$pending2" $null $admin).Json.data
Check "a second donation reusing one PaymentIntent does not corrupt the first" ($donation.amount -eq 5000) "amount=$($donation.amount)"
Write-Output "  (second donation status: $($other.status))"

Write-Output "`n=== Webhook edge cases ==="
$unknown = CheckoutCompletedEvent 'd44d44d44d44d44d44d4ffff' "pi_test_${runId}_unknown" 5000
$sigUnknown = SignPayload $unknown $now $secret
$unknownResult = PostWebhook $unknown "t=$now,v1=$sigUnknown"
Check "an event for an unknown donation is acknowledged, not retried" ($unknownResult.Status -eq 200) "status $($unknownResult.Status)"

$unpaid = ($unknown.Replace("'paid'", "'unpaid'")).Replace('"paid"', '"unpaid"')
$sigUnpaid = SignPayload $unpaid $now $secret
$unpaidResult = PostWebhook $unpaid "t=$now,v1=$sigUnpaid"
Check "an unpaid checkout session is acknowledged without fulfilling" ($unpaidResult.Status -eq 200) "status $($unpaidResult.Status)"

$unhandledEvent = @{
  id = 'evt_unhandled'; object = 'event'; type = 'customer.subscription.updated'
  data = @{ object = @{ id = 'sub_123' } }
} | ConvertTo-Json -Compress -Depth 6
$sigUnhandled = SignPayload $unhandledEvent $now $secret
$unhandledResult = PostWebhook $unhandledEvent "t=$now,v1=$sigUnhandled"
Check "an unhandled event type is acknowledged, not 500" ($unhandledResult.Status -eq 200) "status $($unhandledResult.Status)"

Write-Output "`n=== The webhook is exempt from cookie auth and CSRF ==="
# It carries no cookies and is authenticated by signature alone; requiring CSRF would break it.
# Built ONCE. CheckoutCompletedEvent mints a fresh event id per call, so signing one invocation
# and posting another signs a different payload — which fails verification for the wrong reason.
$csrfPayload = CheckoutCompletedEvent $pending3 "pi_test_${runId}_csrf" 5000
$sigCsrf = SignPayload $csrfPayload $now $secret
$csrfFree = PostWebhook $csrfPayload "t=$now,v1=$sigCsrf"
Check "a signed webhook needs no CSRF token or session" ($csrfFree.Status -eq 200) "status $($csrfFree.Status)"

$csrfDonation = (Req GET "/donations/$pending3" $null $admin).Json.data
Check "and it actually fulfilled the donation" ($csrfDonation.status -eq 'succeeded') "status=$($csrfDonation.status)"

Write-Output "`n=== Refunds reverse the counters ==="
function RefundEvent($intentId) {
  return (@{
    id = "evt_refund_$([guid]::NewGuid().ToString('N').Substring(0,12))"
    object = 'event'; type = 'charge.refunded'
    data = @{ object = @{ id = 'ch_test_1'; object = 'charge'; payment_intent = $intentId; refunded = $true } }
  } | ConvertTo-Json -Compress -Depth 8)
}

$beforeRefund = (Req GET "/donations/stats?shelterId=$shelterId" $null $null).Json.data.total
$refundPayload = RefundEvent "pi_test_${runId}_csrf"
$refundSig = SignPayload $refundPayload $now $secret
$refundResult = PostWebhook $refundPayload "t=$now,v1=$refundSig"
Check "a refund event is accepted" ($refundResult.Status -eq 200) "status $($refundResult.Status)"

$refunded = (Req GET "/donations/$pending3" $null $admin).Json.data
Check "the donation is marked refunded" ($refunded.status -eq 'refunded') "status=$($refunded.status)"

$afterRefund = (Req GET "/donations/stats?shelterId=$shelterId" $null $null).Json.data.total
Check "the shelter total is reduced by the refunded amount" (($beforeRefund - $afterRefund) -eq 5000) "before=$beforeRefund after=$afterRefund"

# Stripe redelivers refund events too; reversing twice would take the money off the total twice.
PostWebhook $refundPayload "t=$now,v1=$refundSig" | Out-Null
$afterRefundReplay = (Req GET "/donations/stats?shelterId=$shelterId" $null $null).Json.data.total
Check "a replayed refund does not subtract twice" ($afterRefundReplay -eq $afterRefund) "after=$afterRefund replay=$afterRefundReplay"

$refundedWall = @((Req GET "/donations/stats?shelterId=$shelterId" $null $null).Json.data.recent | Where-Object { $_.id -eq $pending3 })
Check "a refunded donation drops off the donor wall" ($refundedWall.Count -eq 0) 'still listed publicly'

Write-Output "`n=== Donation history scoping ==="
$anonList = Req GET '/donations' $null (NewSession)
Check "signed-out users cannot list donations" ($anonList.Status -eq 401) "status $($anonList.Status)"

$adopterList = (Req GET '/donations' $null $adopter).Json.data
$notMine = @($adopterList | Where-Object { $_.id -eq $pending1 })
Check "an adopter does not see donations that are not theirs" ($notMine.Count -eq 0) 'saw another donor''s row'

$shelterList = (Req GET '/donations' $null $shelter).Json.data
$received = @($shelterList | Where-Object { $_.id -eq $pending1 })
Check "a shelter owner sees donations made to their shelter" ($received.Count -eq 1) "saw $($received.Count)"

$adminList = (Req GET '/donations?limit=50' $null $admin)
Check "an admin sees all donations" ($adminList.Json.meta.total -ge 24) "total=$($adminList.Json.meta.total)"

$forbidden = Req GET "/donations/$pending1" $null $adopter
Check "reading someone else's donation is 404" ($forbidden.Status -eq 404) "status $($forbidden.Status)"

$shelterRead = Req GET "/donations/$pending1" $null $shelter
Check "the receiving shelter can read the donation" ($shelterRead.Status -eq 200) "status $($shelterRead.Status)"
Check "the recipient sees the real donor name, not 'Anonymous'" ($shelterRead.Json.data.donorName -eq 'Webhook Fixture') "name: $($shelterRead.Json.data.donorName)"

Write-Output "`n=== Notifications ==="
$notes = (Req GET '/notifications?limit=30' $null $shelter).Json.data
$donationNote = @($notes | Where-Object { $_.type -eq 'donation_received' })
Check "the shelter was notified of the donation" ($donationNote.Count -gt 0) 'no notification created'
if ($donationNote.Count -gt 0) {
  Check "the notification states the amount in rupees" ($donationNote[0].title -match 'Rs\. [\d,]+') "title: $($donationNote[0].title)"
}

Write-Output "`n--- donations: $($script:fails) failed ---"
exit $script:fails
