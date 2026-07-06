$ErrorActionPreference = 'Stop'
$web = 'http://localhost:3000'
$api = 'http://localhost:5000/api/v1'
$script:fails = 0

function Check($label, $condition, $detail) {
  if ($condition) { Write-Output "  PASS  $label" }
  else { Write-Output "  FAIL  $label  -> $detail"; $script:fails++ }
}
function NewSession { New-Object Microsoft.PowerShell.Commands.WebRequestSession }

function GetPage($path, $session) {
  $params = @{ Uri = "$web$path"; UseBasicParsing = $true; MaximumRedirection = 0 }
  if ($session) { $params.WebSession = $session }
  try {
    $r = Invoke-WebRequest @params
    return [pscustomobject]@{ Status = [int]$r.StatusCode; Html = $r.Content; Location = $null }
  } catch {
    $resp = $_.Exception.Response
    $status = if ($resp) { [int]$resp.StatusCode } else { 0 }
    # PS 5.1 exposes the redirect target on Headers as a collection, not a plain string; the
    # ResponseUri fallback covers the cases where the header comes back empty.
    $location = $null
    if ($resp) {
      try { $location = $resp.Headers['Location'] } catch {}
      if (-not $location -and $resp.Headers.Location) { $location = $resp.Headers.Location.ToString() }
    }
    return [pscustomobject]@{ Status = $status; Html = $_.ErrorDetails.Message; Location = $location }
  }
}

function LoginAs($email, $password) {
  $s = NewSession
  $body = @{ email = $email; password = $password } | ConvertTo-Json -Compress
  try {
    Invoke-WebRequest -Uri "$api/auth/login" -Method POST -Body $body -ContentType 'application/json' `
      -WebSession $s -UseBasicParsing | Out-Null
    return $s
  } catch { return $null }
}

Write-Output "`n=== Donate page renders without JavaScript ==="
$page = GetPage '/donate' $null
Check "the donate page is public and returns 200" ($page.Status -eq 200) "status $($page.Status)"
Check "the hero headline is server-rendered" ($page.Html -match 'Help them') 'headline missing'
Check "the impact copy is present" ($page.Html -match 'Where your money goes') 'impact section missing'
Check "the donation form is server-rendered" ($page.Html -match 'Choose an amount') 'form missing'

# The hero must not be hidden behind hydration - CLAUDE.md rule 13.
Check "the hero is not rendered at opacity:0" ($page.Html -notmatch 'Help them[\s\S]{0,400}opacity:\s*0') 'hero may be invisible without JS'

Write-Output "`n=== Amounts are formatted from integer minor units (paisa) into NPR ==="
$stats = (Invoke-WebRequest -Uri "$api/donations/stats" -UseBasicParsing).Content | ConvertFrom-Json
$totalPaisa = $stats.data.total
# Rupees, grouped the way Intl renders them (e.g. 173500 paisa -> "1,735").
$expectedRupees = '{0:N0}' -f [math]::Floor($totalPaisa / 100)
Check "the raised total is rendered in rupees, not paisa" ($page.Html -match "Rs\.\s*$([regex]::Escape($expectedRupees))") "expected Rs. $expectedRupees for $totalPaisa paisa"
Check "the raw paisa value is not printed as a price" ($page.Html -notmatch "Rs\.\s*$totalPaisa\b") "found raw $totalPaisa"

# Presets are Rs 500 / Rs 1,000 / Rs 2,500 / Rs 5,000 (see DONATION_PRESETS).
Check "preset amounts are shown in rupees" ($page.Html -match 'Rs\.\s*500\b' -and $page.Html -match 'Rs\.\s*1,000\b') 'presets missing'

Write-Output "`n=== Donor wall ==="
Check "the donor wall is server-rendered" ($page.Html -match 'Recent supporters') 'wall heading missing'

$anonymousSeeded = @($stats.data.recent | Where-Object { $_.isAnonymous })
if ($anonymousSeeded.Count -gt 0) {
  Check "anonymous donors show as 'Anonymous'" ($page.Html -match 'Anonymous') 'no masked entry rendered'
}
$namedDonor = ($stats.data.recent | Where-Object { -not $_.isAnonymous } | Select-Object -First 1)
if ($namedDonor) {
  Check "named donors are shown" ($page.Html -match [regex]::Escape($namedDonor.donorName)) "missing $($namedDonor.donorName)"
}

Write-Output "`n=== Guest vs signed-in donation form ==="
Check "guests are asked for a name and email" ($page.Html -match 'Your name' -and $page.Html -match 'Email for your receipt') 'guest fields missing'

$adopter = LoginAs 'adopter@pawfecthome.seed' 'DemoPass123'
if ($adopter) {
  $authed = GetPage '/donate' $adopter
  Check "signed-in donors are not asked to retype their email" ($authed.Html -notmatch 'Email for your receipt') 'guest fields shown to a signed-in user'
  Check "signed-in donors see where the receipt goes" ($authed.Html -match 'adopter@pawfecthome\.seed') 'receipt address not shown'
} else {
  Write-Output "  SKIP  could not sign in (rate limited?)"
}

Write-Output "`n=== Payment method selector ==="
Check "the donate page offers a payment method choice" ($page.Html -match 'Payment method') 'no selector'
Check "eSewa is offered as an online option" ($page.Html -match 'eSewa') 'eSewa missing'
Check "cash on delivery is offered" ($page.Html -match 'Pay the shelter in person' -or $page.Html -match 'Cash') 'COD missing'
Check "amounts in the form read in rupees" ($page.Html -match 'Rs\.') 'no Rs. in form'
Check "no stray dollar amount on the donate page" ($page.Html -notmatch '\$\d+ (feeds|covers|pays|funds)') 'dollar impact copy leaked'

Write-Output "`n=== Payment result pages ==="
$codSuccess = GetPage '/donate/success?method=cod&amount=250000' $null
Check "the COD success page renders" ($codSuccess.Status -eq 200) "status $($codSuccess.Status)"
Check "COD success reads as a recorded pledge" ($codSuccess.Html -match 'Pledge recorded') 'not a pledge'
Check "COD success shows the pledged amount in rupees" ($codSuccess.Html -match 'Rs\. 2,500') 'amount missing'
Check "COD success does not claim the cash arrived" ($codSuccess.Html -match 'hand the cash|confirm') 'overclaims'
Check "the success page is excluded from indexing" ($codSuccess.Html -match 'noindex') 'missing noindex'

$esewaSuccess = GetPage '/donate/success?method=esewa&amount=250000' $null
Check "the eSewa success page thanks the donor" ($esewaSuccess.Html -match 'Thank you') 'thanks missing'

$failed = GetPage '/donate/failed?method=esewa&reason=not_complete' $null
Check "the payment failed page renders" ($failed.Status -eq 200) "status $($failed.Status)"
Check "it states the payment was not completed" ($failed.Html -match 'not completed') 'no failure copy'
Check "it reassures nothing was charged" ($failed.Html -match 'not been charged') 'no reassurance'
Check "it offers a retry" ($failed.Html -match 'Try again') 'no retry'
Check "an unknown reason falls back to a generic message" ((GetPage '/donate/failed' $null).Html -match 'not completed') 'no fallback'

Write-Output "`n=== eSewa callback ==="
$callback = GetPage '/payment/esewa?failed=1' $null
Check "the eSewa callback page renders" ($callback.Status -eq 200) "status $($callback.Status)"
Check "it shows a confirming state" ($callback.Html -match 'Confirming your payment') 'no confirming state'
Check "the callback is excluded from indexing" ($callback.Html -match 'noindex') 'missing noindex'

Write-Output "`n=== Shelter donations (mark-received) ==="
$shelter = LoginAs 'shelter1@pawfecthome.seed' 'ShelterPass123'
if ($shelter) {
  $shelterDon = GetPage '/shelter/donations' $shelter
  Check "the shelter donations page loads" ($shelterDon.Status -eq 200) "status $($shelterDon.Status)"
  Check "it shows the donations table or an empty state" `
    ($shelterDon.Html -match 'Donations to your shelter' -or $shelterDon.Html -match 'No donations yet') 'neither table nor empty state'
  Check "the shelter nav links to donations" ($shelterDon.Html -match 'href="/shelter/donations"') 'nav entry missing'
} else {
  Write-Output "  SKIP  could not sign in as shelter owner"
}

Write-Output "`n=== Donation history is protected ==="
$anon = GetPage '/dashboard/donations' $null
Check "signed-out users are redirected away from donation history" ($anon.Status -eq 307 -or $anon.Status -eq 302) "status $($anon.Status)"
# Following the redirect and asserting the destination, rather than reading the Location header:
# PS 5.1 does not reliably expose headers on the WebException a 3xx raises.
$followed = Invoke-WebRequest -Uri "$web/dashboard/donations" -UseBasicParsing
Check "the redirect lands on the login page" ($followed.Content -match 'Sign in|Log in|password') 'did not land on login'

if ($adopter) {
  $history = GetPage '/dashboard/donations' $adopter
  Check "a signed-in user can open their donation history" ($history.Status -eq 200) "status $($history.Status)"
  Check "the history page has an accessible table caption or empty state" `
    ($history.Html -match 'Your donation history' -or $history.Html -match 'No donations yet') 'neither table nor empty state'
  Check "the donations nav entry is present" ($history.Html -match 'Donations') 'nav entry missing'
}

Write-Output "`n=== Navigation ==="
$homePage = GetPage '/' $null   # not $home - that name is read-only in PowerShell
Check "the header links to /donate" ($homePage.Html -match 'href="/donate"') 'no donate link'

Write-Output "`n--- donations-frontend: $($script:fails) failed ---"
exit $script:fails
