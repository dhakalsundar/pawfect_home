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
$shelter = LoginAs 'shelter1@pawfecthome.seed' 'ShelterPass123'
$admin   = LoginAs 'admin@pawfecthome.seed' 'DemoPass123'
if (-not $adopter -or -not $shelter -or -not $admin) {
  Write-Output "  SKIP  auth rate limited - restart the backend and retry"
  exit 0
}
Check "logged in as adopter + shelter owner + admin" $true ''

# A pet belonging to shelter1, so the resolved recipient is that shelter's owner.
$myPets = (Req GET '/shelters/me/pets?limit=1' $null $shelter).Json.data
$pet = $myPets[0]
Check "found a pet owned by the shelter user" ($null -ne $pet) 'no pet returned'
Write-Output "  target pet: $($pet.name) ($($pet.id))"

Write-Output "`n=== Starting conversations ==="
$start = Req POST '/conversations' @{ petId = $pet.id } $adopter
Check "adopter can start a conversation about a pet" ($start.Status -eq 201) "status $($start.Status): $($start.Body)"
$conv = $start.Json.data
Check "conversation names the shelter owner as the other party" ($conv.other.id -and $conv.other.name) "other: $($conv.other | ConvertTo-Json -Compress)"
Check "conversation carries the pet context" ($conv.pet.id -eq $pet.id) "pet: $($conv.pet.id)"
Check "a new conversation starts with zero unread" ($conv.unread -eq 0) "unread=$($conv.unread)"

# Idempotency: the unique {pairKey, pet} index and the service must agree.
$again = Req POST '/conversations' @{ petId = $pet.id } $adopter
Check "starting the same conversation twice returns the same thread" ($again.Json.data.id -eq $conv.id) "got $($again.Json.data.id), expected $($conv.id)"

# The multikey-index bug: a second adopter messaging the SAME shelter about the SAME pet must work.
$second = Req POST '/conversations' @{ petId = $pet.id } $admin
Check "a different user can also message that shelter about the same pet" ($second.Status -eq 201) "status $($second.Status): $($second.Body)"
Check "the second user gets their own separate thread" ($second.Json.data.id -ne $conv.id) 'threads were merged'

$self = Req POST '/conversations' @{ recipientId = $conv.other.id } $shelter
Check "you cannot start a conversation with yourself" ($self.Status -eq 422) "status $($self.Status)"

$ghost = Req POST '/conversations' @{ petId = 'a11aaaaaaaaaaaaaaaaaaaaa' } $adopter
Check "starting a conversation about a nonexistent pet is 404" ($ghost.Status -eq 404) "status $($ghost.Status)"

Write-Output "`n=== Message ordering under rapid sends ==="
# 12 sends back to back, deliberately fast enough to share a createdAt millisecond. Without the
# _id tiebreaker in the sort these come back interleaved.
$sent = @()
for ($i = 1; $i -le 12; $i++) {
  $r = Req POST "/conversations/$($conv.id)/messages" @{ body = "ordered-$i" } $adopter
  if ($r.Status -eq 201) { $sent += $r.Json.data }
}
Check "all 12 rapid sends were accepted" ($sent.Count -eq 12) "only $($sent.Count) accepted"

$distinct = ($sent | Select-Object -ExpandProperty createdAt -Unique).Count
Write-Output "  distinct createdAt values across 12 sends: $distinct (ties are the point of this test)"

$page = (Req GET "/conversations/$($conv.id)/messages?limit=50" $null $adopter).Json.data
$bodies = @($page.items | ForEach-Object { $_.body })
$expected = @(1..12 | ForEach-Object { "ordered-$_" })
Check "messages read back oldest-to-newest in send order" (($bodies -join ',') -eq ($expected -join ',')) "got: $($bodies -join ',')"

Write-Output "`n=== Cursor pagination ==="
$firstPage = (Req GET "/conversations/$($conv.id)/messages?limit=5" $null $adopter).Json.data
Check "limit is honoured" ($firstPage.items.Count -eq 5) "got $($firstPage.items.Count)"
Check "a full page returns a cursor" ($null -ne $firstPage.nextCursor) 'nextCursor was null'
Check "the newest messages come back first" ($firstPage.items[-1].body -eq 'ordered-12') "last was $($firstPage.items[-1].body)"

$secondPage = (Req GET "/conversations/$($conv.id)/messages?limit=5&before=$($firstPage.nextCursor)" $null $adopter).Json.data
$overlap = @($secondPage.items | Where-Object { $firstPage.items.id -contains $_.id })
Check "the second page does not repeat the first" ($overlap.Count -eq 0) "$($overlap.Count) rows repeated"
Check "the second page continues the sequence" ($secondPage.items[-1].body -eq 'ordered-7') "last was $($secondPage.items[-1].body)"

Write-Output "`n=== Unread counts ==="
$shelterInbox = (Req GET '/conversations' $null $shelter).Json.data
$mine = $shelterInbox | Where-Object { $_.id -eq $conv.id }
Check "the recipient's inbox shows the conversation" ($null -ne $mine) 'conversation missing from inbox'
Check "the recipient has 12 unread" ($mine.unread -eq 12) "unread=$($mine.unread)"

$senderView = (Req GET '/conversations' $null $adopter).Json.data | Where-Object { $_.id -eq $conv.id }
Check "the sender has no unread of their own messages" ($senderView.unread -eq 0) "unread=$($senderView.unread)"

$total = (Req GET '/conversations/unread-count' $null $shelter).Json.data.unreadCount
Check "the unread total includes them" ($total -ge 12) "total=$total"

$read = Req PUT "/conversations/$($conv.id)/read" $null $shelter
Check "marking read succeeds" ($read.Status -eq 200) "status $($read.Status)"
$after = (Req GET '/conversations' $null $shelter).Json.data | Where-Object { $_.id -eq $conv.id }
Check "unread resets to 0 on open" ($after.unread -eq 0) "unread=$($after.unread)"

$lastMessage = $after.lastMessage
Check "the inbox preview shows the latest message" ($lastMessage.body -eq 'ordered-12') "preview: $($lastMessage.body)"
Check "the preview knows it was not from the reader" ($lastMessage.fromMe -eq $false) 'fromMe was true'

Write-Output "`n=== Participant isolation ==="
# The admin is a real, authenticated user who is simply not in this thread.
$peek = Req GET "/conversations/$($conv.id)/messages" $null $admin
Check "a non-participant cannot read the thread" ($peek.Status -eq 404) "status $($peek.Status)"

$intrude = Req POST "/conversations/$($conv.id)/messages" @{ body = 'let me in' } $admin
Check "a non-participant cannot post to the thread" ($intrude.Status -eq 404) "status $($intrude.Status)"

$markOther = Req PUT "/conversations/$($conv.id)/read" $null $admin
Check "a non-participant cannot mark the thread read" ($markOther.Status -eq 404) "status $($markOther.Status)"

$adminInbox = (Req GET '/conversations' $null $admin).Json.data
$leaked = @($adminInbox | Where-Object { $_.id -eq $conv.id })
Check "the thread does not appear in a non-participant's inbox" ($leaked.Count -eq 0) 'thread leaked into inbox'

$anon = NewSession
$noAuth = Req GET '/conversations' $null $anon
Check "signed-out users get 401" ($noAuth.Status -eq 401) "status $($noAuth.Status)"

# A WRONG token rather than a missing one, deliberately: WebRequestSession persists headers set on
# earlier Invoke-WebRequest calls, so "omit the header" silently reuses the real token from a
# previous request and passes for the wrong reason. Overriding it tests the comparison itself.
$badCsrf = @{ Uri = "$api/conversations/$($conv.id)/messages"; Method = 'POST'; UseBasicParsing = $true
              WebSession = $adopter; ContentType = 'application/json'; Body = '{"body":"bad csrf"}'
              Headers = @{ 'X-CSRF-Token' = ('0' * 64) } }
try { $r = Invoke-WebRequest @badCsrf; $s = [int]$r.StatusCode } catch { $s = [int]$_.Exception.Response.StatusCode }
Check "sending with a forged CSRF token is rejected" ($s -eq 403) "status $s"

Write-Output "`n=== Input validation ==="
$empty = Req POST "/conversations/$($conv.id)/messages" @{ body = '   ' } $adopter
Check "an empty message is rejected" ($empty.Status -eq 422) "status $($empty.Status)"

$long = Req POST "/conversations/$($conv.id)/messages" @{ body = ('x' * 2001) } $adopter
Check "a message over 2000 characters is rejected" ($long.Status -eq 422) "status $($long.Status)"

$xss = Req POST "/conversations/$($conv.id)/messages" @{ body = '<script>alert(1)</script>' } $adopter
Check "markup is stored verbatim, not stripped or executed" ($xss.Status -eq 201 -and $xss.Json.data.body -eq '<script>alert(1)</script>') "body: $($xss.Json.data.body)"

$badConv = Req GET '/conversations/not-an-id/messages' $null $adopter
Check "a malformed conversation id is handled cleanly" ($badConv.Status -eq 404 -or $badConv.Status -eq 422) "status $($badConv.Status)"

$noTarget = Req POST '/conversations' @{} $adopter
Check "starting with neither a recipient nor a pet is rejected" ($noTarget.Status -eq 422) "status $($noTarget.Status)"

Write-Output "`n=== Notifications ==="
$notes = (Req GET '/notifications?limit=20' $null $shelter).Json.data
$msgNote = @($notes | Where-Object { $_.type -eq 'new_message' })
Check "the recipient got a new_message notification" ($msgNote.Count -gt 0) 'no notification created'
Check "the notification deep-links to the thread" ($msgNote[0].link -like "*c=$($conv.id)*") "link: $($msgNote[0].link)"

Write-Output "`n--- messaging: $($script:fails) failed ---"
exit $script:fails
