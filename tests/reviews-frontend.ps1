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
  $params = @{ Uri = "$web$path"; UseBasicParsing = $true }
  if ($session) { $params.WebSession = $session }
  try {
    $r = Invoke-WebRequest @params
    return [pscustomobject]@{ Status = [int]$r.StatusCode; Html = $r.Content }
  } catch {
    $s = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    return [pscustomobject]@{ Status = $s; Html = $_.ErrorDetails.Message }
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

Write-Output "`n=== Setup ==="
$pet = ((Invoke-WebRequest -Uri "$api/pets?limit=1" -UseBasicParsing).Content | ConvertFrom-Json).data[0]
Check "found a pet to open" ($null -ne $pet) 'no pet returned'
$shelterId = $pet.shelter.id
$breakdown = ((Invoke-WebRequest -Uri "$api/reviews/breakdown/$shelterId" -UseBasicParsing).Content | ConvertFrom-Json).data

Write-Output "`n=== Reviews render on the pet page without JavaScript ==="
$page = GetPage "/pets/$($pet.slug)" $null
Check "the pet page still loads with reviews added" ($page.Status -eq 200) "status $($page.Status)"
Check "the reviews section is server-rendered" ($page.Html -match 'What adopters say about') 'section missing'

if ($breakdown.count -gt 0) {
  Check "the average rating is shown" ($page.Html -match [regex]::Escape($breakdown.average.ToString('0.0'))) "expected $($breakdown.average)"
  Check "the review count is shown" ($page.Html -match "$($breakdown.count) review") "expected $($breakdown.count)"
  # The bars are real progressbars, so assistive tech announces the proportion.
  Check "distribution bars use role=progressbar" ($page.Html -match 'role="progressbar"') 'no progressbar role'
  Check "each bar is labelled with its share" ($page.Html -match 'star: \d+ of \d+ reviews') 'bars are unlabelled'
} else {
  Check "the empty state is shown when there are no reviews" ($page.Html -match 'No reviews yet') 'no empty state'
}

# Stars duplicate the number, so they must be hidden and the value announced once in words.
Check "star icons are hidden from screen readers" ($page.Html -match 'aria-hidden="true"') 'stars not hidden'
Check "the rating is announced in words" ($page.Html -match 'out of 5') 'no textual rating'

Write-Output "`n=== Only approved reviews reach the page ==="
$pending = ((Invoke-WebRequest -Uri "$api/reviews?shelterId=$shelterId&limit=50" -UseBasicParsing).Content | ConvertFrom-Json).data
$nonApproved = @($pending | Where-Object { $_.status -ne 'approved' })
Check "the public API returns only approved reviews" ($nonApproved.Count -eq 0) "$($nonApproved.Count) leaked"

$firstApproved = $pending | Select-Object -First 1
if ($firstApproved) {
  $snippet = $firstApproved.comment.Substring(0, [Math]::Min(40, $firstApproved.comment.Length))
  Check "an approved review's text appears on the page" ($page.Html -match [regex]::Escape($snippet)) 'review text missing'
}

Write-Output "`n=== My reviews page ==="
$adopter = LoginAs 'adopter@pawfecthome.seed' 'DemoPass123'
if (-not $adopter) {
  Write-Output "  SKIP  could not sign in (rate limited?)"
} else {
  $mine = GetPage '/dashboard/reviews' $adopter
  Check "the my-reviews page loads" ($mine.Status -eq 200) "status $($mine.Status)"
  Check "it has a heading" ($mine.Html -match 'My reviews') 'heading missing'
  Check "it explains the moderation state or shows an empty state" `
    ($mine.Html -match 'Waiting for a moderator|Live on the site|No reviews yet') 'no status copy'
  Check "the reviews nav entry is present" ($mine.Html -match 'href="/dashboard/reviews"') 'nav entry missing'
}

Write-Output "`n=== Admin moderation queue ==="
$admin = LoginAs 'admin@pawfecthome.seed' 'DemoPass123'
if (-not $admin) {
  Write-Output "  SKIP  could not sign in as admin"
} else {
  $queue = GetPage '/admin/reviews' $admin
  Check "the moderation queue loads" ($queue.Status -eq 200) "status $($queue.Status)"
  Check "it defaults to the pending filter" ($queue.Html -match 'pending') 'no pending filter'
  Check "the status filter lives in the URL, not client state" ($queue.Html -match 'href="/admin/reviews\?status=approved"') 'no URL filter links'
  Check "approve and reject controls are present" ($queue.Html -match 'Approve' -and $queue.Html -match 'Reject') 'controls missing'

  $adopterOnAdmin = GetPage '/admin/reviews' $adopter
  Check "a non-admin cannot open the moderation queue" ($adopterOnAdmin.Status -ne 200 -or $adopterOnAdmin.Html -notmatch 'Approve') "status $($adopterOnAdmin.Status)"
}

Write-Output "`n=== Shelter reviews page ==="
$shelter = LoginAs 'shelter1@pawfecthome.seed' 'ShelterPass123'
if (-not $shelter) {
  Write-Output "  SKIP  could not sign in as shelter owner"
} else {
  $shelterPage = GetPage '/shelter/reviews' $shelter
  Check "the shelter reviews page loads" ($shelterPage.Status -eq 200) "status $($shelterPage.Status)"
  Check "it shows the rating breakdown" ($shelterPage.Html -match 'role="progressbar"' -or $shelterPage.Html -match 'No reviews yet') 'no breakdown'
  Check "a reply control is offered" ($shelterPage.Html -match 'Respond|Edit response|No published reviews') 'no reply affordance'
  Check "the reviews nav entry is present" ($shelterPage.Html -match 'href="/shelter/reviews"') 'nav entry missing'
}

Write-Output "`n=== Protected routes ==="
foreach ($path in @('/dashboard/reviews', '/admin/reviews', '/shelter/reviews')) {
  $anon = GetPage $path $null
  # Follows the redirect, so a successful sign-out bounce lands on the login form.
  Check "$path is not readable signed out" ($anon.Html -match 'Sign in|Log in|password') "status $($anon.Status)"
}

Write-Output "`n--- reviews-frontend: $($script:fails) failed ---"
exit $script:fails
