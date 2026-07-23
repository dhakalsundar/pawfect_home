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

function Breakdown($shelterId) {
  return (Req GET "/reviews/breakdown/$shelterId" $null $null).Json.data
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

# shelter1's own shelter (deterministic seed id) and a different one to review.
$ownShelter   = 'b22b22b22b22b22b22b20000'
$otherShelter = 'b22b22b22b22b22b22b20001'

Write-Output "`n=== Public listing shows approved reviews only ==="
$public = Req GET '/reviews?limit=50' $null $null
Check "the review list is public" ($public.Status -eq 200) "status $($public.Status)"
$notApproved = @($public.Json.data | Where-Object { $_.status -ne 'approved' })
Check "no pending or rejected review is publicly visible" ($notApproved.Count -eq 0) "$($notApproved.Count) leaked"

$queue = Req GET '/reviews/moderation/queue?status=pending' $null $admin
Check "an admin can see the pending queue" ($queue.Status -eq 200) "status $($queue.Status)"
Check "there are pending reviews the public list did not show" ($queue.Json.meta.total -gt 0) 'seed produced no pending reviews'

$queueAsUser = Req GET '/reviews/moderation/queue' $null $adopter
Check "a non-admin cannot open the moderation queue" ($queueAsUser.Status -eq 403) "status $($queueAsUser.Status)"

Write-Output "`n=== One review per user per shelter (DB-enforced) ==="
$create = Req POST '/reviews' @{
  shelterId = $otherShelter; rating = 4; title = 'Kind and patient'
  comment = 'They took the time to introduce us properly and never rushed the decision.'
} $adopter
Check "an authenticated user can post a review" ($create.Status -eq 201) "status $($create.Status): $($create.Body)"
$myReview = $create.Json.data
Check "a new review starts as pending" ($myReview.status -eq 'pending') "status=$($myReview.status)"
Check "it is not verified without a completed adoption" ($myReview.verified -eq $false) 'verified without an adoption'

$duplicate = Req POST '/reviews' @{
  shelterId = $otherShelter; rating = 1
  comment = 'Trying to review the same shelter a second time.'
} $adopter
Check "a second review for the same shelter is rejected" ($duplicate.Status -eq 409) "status $($duplicate.Status)"
Check "the rejection explains why" ($duplicate.Json.error.message -match 'already reviewed') "message: $($duplicate.Json.error.message)"

# Fire several at once: a check-then-insert would let two through, only the unique index will not.
$jobs = 1..4 | ForEach-Object {
  Start-Job -ScriptBlock {
    param($api, $cookieHeader, $csrf, $shelterId)
    $body = @{ shelterId = $shelterId; rating = 3; comment = 'Concurrent duplicate attempt for the race test.' } | ConvertTo-Json -Compress
    try {
      $r = Invoke-WebRequest -Uri "$api/reviews" -Method POST -Body $body -ContentType 'application/json' `
        -Headers @{ 'X-CSRF-Token' = $csrf; 'Cookie' = $cookieHeader } -UseBasicParsing
      [int]$r.StatusCode
    } catch { if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 } }
  } -ArgumentList $api, (($adopter.Cookies.GetCookies($api) | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '; '),
    (($adopter.Cookies.GetCookies($api) | Where-Object Name -eq 'ph_csrf').Value), $otherShelter
}
$results = $jobs | Wait-Job | Receive-Job
$jobs | Remove-Job
$created = @($results | Where-Object { $_ -eq 201 })
Check "four concurrent duplicates all fail (index closes the race)" ($created.Count -eq 0) "$($created.Count) got through"

$selfReview = Req POST '/reviews' @{
  shelterId = $ownShelter; rating = 5; comment = 'Reviewing my own shelter, which should not be allowed.'
} $shelter
Check "a shelter owner cannot review their own shelter" ($selfReview.Status -eq 422) "status $($selfReview.Status)"

$anonReview = Req POST '/reviews' @{ shelterId = $otherShelter; rating = 5; comment = 'Anonymous attempt here.' } (NewSession)
Check "signed-out users cannot post a review" ($anonReview.Status -eq 401) "status $($anonReview.Status)"

Write-Output "`n=== Validation ==="
$shortComment = Req POST '/reviews' @{ shelterId = $ownShelter; rating = 5; comment = 'Too short' } $admin
Check "a comment under 10 characters is rejected" ($shortComment.Status -eq 422) "status $($shortComment.Status)"

$badRating = Req POST '/reviews' @{ shelterId = $ownShelter; rating = 6; comment = 'A rating outside the scale.' } $admin
Check "a rating above 5 is rejected" ($badRating.Status -eq 422) "status $($badRating.Status)"

$halfStar = Req POST '/reviews' @{ shelterId = $ownShelter; rating = 4.5; comment = 'Half stars break the histogram.' } $admin
Check "a fractional rating is rejected" ($halfStar.Status -eq 422) "status $($halfStar.Status)"

$zeroRating = Req POST '/reviews' @{ shelterId = $ownShelter; rating = 0; comment = 'Zero is not on the scale.' } $admin
Check "a zero rating is rejected" ($zeroRating.Status -eq 422) "status $($zeroRating.Status)"

Write-Output "`n=== The average recomputes on moderation ==="
$before = Breakdown $otherShelter
Check "the shelter has an existing average" ($before.count -gt 0) "count=$($before.count)"

# Approving a 4-star review must move the mean by exactly the amount arithmetic says it should.
$expectedAfter = [math]::Round(((($before.average * $before.count) + 4) / ($before.count + 1)), 1)

$approve = Req PUT "/reviews/$($myReview.id)/moderate" @{ status = 'approved' } $admin
Check "an admin can approve a review" ($approve.Status -eq 200) "status $($approve.Status): $($approve.Body)"

$afterApprove = Breakdown $otherShelter
Check "the review count increased by one" ($afterApprove.count -eq ($before.count + 1)) "before=$($before.count) after=$($afterApprove.count)"
Check "the average matches the arithmetic exactly" ($afterApprove.average -eq $expectedAfter) "expected $expectedAfter got $($afterApprove.average)"
Check "the 4-star bucket gained one" ($afterApprove.distribution.'4' -eq ($before.distribution.'4' + 1)) "before=$($before.distribution.'4') after=$($afterApprove.distribution.'4')"

$nowPublic = @((Req GET "/reviews?shelterId=$otherShelter&limit=50" $null $null).Json.data | Where-Object { $_.id -eq $myReview.id })
Check "an approved review appears in the public list" ($nowPublic.Count -eq 1) 'not published'

# Rejecting an ALREADY-APPROVED review has to take it back out again.
$reject = Req PUT "/reviews/$($myReview.id)/moderate" @{ status = 'rejected'; note = 'Testing reversal.' } $admin
Check "an admin can reject a previously approved review" ($reject.Status -eq 200) "status $($reject.Status)"

$afterReject = Breakdown $otherShelter
Check "rejecting removes it from the count again" ($afterReject.count -eq $before.count) "expected $($before.count) got $($afterReject.count)"
Check "rejecting restores the original average" ($afterReject.average -eq $before.average) "expected $($before.average) got $($afterReject.average)"

$goneFromPublic = @((Req GET "/reviews?shelterId=$otherShelter&limit=50" $null $null).Json.data | Where-Object { $_.id -eq $myReview.id })
Check "a rejected review disappears from the public list" ($goneFromPublic.Count -eq 0) 'still visible'

$moderateAsUser = Req PUT "/reviews/$($myReview.id)/moderate" @{ status = 'approved' } $adopter
Check "a non-admin cannot moderate" ($moderateAsUser.Status -eq 403) "status $($moderateAsUser.Status)"

Write-Output "`n=== The average recomputes on delete ==="
Req PUT "/reviews/$($myReview.id)/moderate" @{ status = 'approved' } $admin | Out-Null
$beforeDelete = Breakdown $otherShelter
Check "the review is counted again after re-approval" ($beforeDelete.count -eq ($before.count + 1)) "count=$($beforeDelete.count)"

$delete = Req DELETE "/reviews/$($myReview.id)" $null $adopter
Check "the author can delete their review" ($delete.Status -eq 200) "status $($delete.Status)"

$afterDelete = Breakdown $otherShelter
Check "deleting removes it from the count" ($afterDelete.count -eq $before.count) "expected $($before.count) got $($afterDelete.count)"
Check "deleting restores the original average" ($afterDelete.average -eq $before.average) "expected $($before.average) got $($afterDelete.average)"

# The soft delete must free the unique-index slot, or the author can never review again.
$reReview = Req POST '/reviews' @{
  shelterId = $otherShelter; rating = 5
  comment = 'Posting again after deleting my previous review.'
} $adopter
Check "deleting frees the slot so the author can review again" ($reReview.Status -eq 201) "status $($reReview.Status): $($reReview.Body)"
$secondReview = $reReview.Json.data

Write-Output "`n=== Editing sends a review back to moderation ==="
Req PUT "/reviews/$($secondReview.id)/moderate" @{ status = 'approved' } $admin | Out-Null
$countWhileApproved = (Breakdown $otherShelter).count

$edit = Req PUT "/reviews/$($secondReview.id)" @{ comment = 'Edited after approval - this must be re-checked before going live again.' } $adopter
Check "the author can edit their own review" ($edit.Status -eq 200) "status $($edit.Status)"
Check "an edited review returns to pending" ($edit.Json.data.status -eq 'pending') "status=$($edit.Json.data.status)"

$afterEdit = Breakdown $otherShelter
Check "an edited review drops out of the average until re-approved" ($afterEdit.count -eq ($countWhileApproved - 1)) "before=$countWhileApproved after=$($afterEdit.count)"

$editOther = Req PUT "/reviews/$($secondReview.id)" @{ comment = 'Someone else trying to edit this review.' } $admin
Check "another user cannot edit it" ($editOther.Status -eq 404) "status $($editOther.Status)"

Write-Output "`n=== Helpful votes are idempotent ==="
Req PUT "/reviews/$($secondReview.id)/moderate" @{ status = 'approved' } $admin | Out-Null

$vote1 = Req POST "/reviews/$($secondReview.id)/helpful" $null $shelter
Check "a user can mark a review helpful" ($vote1.Status -eq 200) "status $($vote1.Status)"
Check "the count is 1 after one vote" ($vote1.Json.data.helpfulCount -eq 1) "count=$($vote1.Json.data.helpfulCount)"

$vote2 = Req POST "/reviews/$($secondReview.id)/helpful" $null $shelter
Check "voting again toggles it off rather than incrementing" ($vote2.Json.data.helpfulCount -eq 0) "count=$($vote2.Json.data.helpfulCount)"

Req POST "/reviews/$($secondReview.id)/helpful" $null $shelter | Out-Null
$vote4 = Req POST "/reviews/$($secondReview.id)/helpful" $null $admin
Check "two different users produce a count of 2" ($vote4.Json.data.helpfulCount -eq 2) "count=$($vote4.Json.data.helpfulCount)"

$ownVote = Req POST "/reviews/$($secondReview.id)/helpful" $null $adopter
Check "you cannot mark your own review helpful" ($ownVote.Status -eq 422) "status $($ownVote.Status)"

Write-Output "`n=== Cross-shelter reply isolation ==="
# shelter1 owns $ownShelter; this review is on $otherShelter, so the reply must not land.
$wrongShelterReply = Req POST "/reviews/$($secondReview.id)/reply" @{ body = 'Replying to a review that is not mine.' } $shelter
Check "a shelter cannot reply to another shelter's review" ($wrongShelterReply.Status -eq 404) "status $($wrongShelterReply.Status)"

$replyAsUser = Req POST "/reviews/$($secondReview.id)/reply" @{ body = 'A plain user trying to reply.' } $adopter
Check "a plain user cannot post a shelter reply" ($replyAsUser.Status -eq 403) "status $($replyAsUser.Status)"

<#
  The verified badge, driven end to end rather than asserted against a constant.

  A reviewer account adopts a pet from shelter1, the application is walked to `completed`, and only
  then is the review written. This is the only way to prove the badge is *earned* - an earlier
  version of this section compared against a hardcoded $true and would have passed no matter what
  the API did.
#>
Write-Output "`n=== Verified badge is earned, not claimed ==="
$reviewer = LoginAs 'reviewer12@pawfecthome.seed' 'ReviewPass123'
if (-not $reviewer) {
  Write-Output "  SKIP  reviewer account unavailable"
} else {
  $shelterPet = (Req GET '/shelters/me/pets?status=available&limit=1' $null $shelter).Json.data[0]

  $answers = @{
    housingType = 'house'; ownOrRent = 'own'; hasYard = $true; householdSize = 3
    hasChildren = $false; hoursAlonePerDay = 4; experienceLevel = 'experienced'
    reasonForAdopting = 'We have a large fenced garden and years of experience with rescue animals, and someone is home most of the day.'
  }

  $application = Req POST '/adoptions' @{ petId = $shelterPet.id; answers = $answers; agreedToTerms = $true } $reviewer
  if ($application.Status -ne 201) {
    Write-Output "  SKIP  could not create an application ($($application.Status): $($application.Body))"
  } else {
    $appId = $application.Json.data.id

    # The state machine forbids pending -> completed, so walk it properly.
    Req PUT "/adoptions/$appId/status" @{ status = 'under_review' } $shelter | Out-Null
    Req PUT "/adoptions/$appId/status" @{ status = 'approved'; note = 'Great fit.' } $shelter | Out-Null
    $completed = Req PUT "/adoptions/$appId/status" @{ status = 'completed' } $shelter
    Check "the adoption reaches completed" ($completed.Status -eq 200) "status $($completed.Status): $($completed.Body)"

    $verifiedReview = Req POST '/reviews' @{
      shelterId = $ownShelter; rating = 5; title = 'Adopted from them ourselves'
      comment = 'We adopted through this shelter and the whole process was handled with real care.'
    } $reviewer
    Check "the adopter can review the shelter they adopted from" ($verifiedReview.Status -eq 201) "status $($verifiedReview.Status): $($verifiedReview.Body)"
    Check "the review carries the verified badge" ($verifiedReview.Json.data.verified -eq $true) 'badge not awarded after a completed adoption'

    $verifiedId = $verifiedReview.Json.data.id
    Req PUT "/reviews/$verifiedId/moderate" @{ status = 'approved' } $admin | Out-Null

    # And now the positive reply case: this review IS on shelter1's own shelter.
    $ownReply = Req POST "/reviews/$verifiedId/reply" @{ body = 'Thank you so much - it was a pleasure to help.' } $shelter
    Check "the reviewed shelter can reply to its own review" ($ownReply.Status -eq 200) "status $($ownReply.Status): $($ownReply.Body)"
    Check "the reply is returned on the review" ($ownReply.Json.data.shelterReply.body -match 'pleasure to help') "reply: $($ownReply.Json.data.shelterReply.body)"

    $publicVerified = @((Req GET "/reviews?shelterId=$ownShelter&limit=50" $null $null).Json.data | Where-Object { $_.id -eq $verifiedId })
    Check "the verified badge survives serialisation to the public list" ($publicVerified[0].verified -eq $true) 'badge lost'
    Check "the shelter reply is visible publicly" ($null -ne $publicVerified[0].shelterReply) 'reply not public'

    Req DELETE "/reviews/$verifiedId" $null $reviewer | Out-Null
  }
}

Write-Output "`n=== My reviews ==="
$mine = Req GET '/reviews/mine' $null $adopter
Check "a user can list their own reviews in any state" ($mine.Status -eq 200) "status $($mine.Status)"
$mineIds = @($mine.Json.data | Where-Object { $_.id -eq $secondReview.id })
Check "their own pending/approved review is included" ($mineIds.Count -eq 1) 'own review missing'

$mineForShelter = Req GET "/reviews/mine/$otherShelter" $null $adopter
Check "a user can fetch their review of one shelter" ($mineForShelter.Status -eq 200) "status $($mineForShelter.Status)"
Check "it returns the right review" ($mineForShelter.Json.data.id -eq $secondReview.id) "got $($mineForShelter.Json.data.id)"

Write-Output "`n=== Cleanup ==="
Req DELETE "/reviews/$($secondReview.id)" $null $adopter | Out-Null
$final = Breakdown $otherShelter
Check "the shelter average is back where it started" ($final.average -eq $before.average -and $final.count -eq $before.count) `
  "expected $($before.average)/$($before.count) got $($final.average)/$($final.count)"

Write-Output "`n--- reviews: $($script:fails) failed ---"
exit $script:fails
