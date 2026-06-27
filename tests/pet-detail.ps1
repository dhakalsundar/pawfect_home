$ErrorActionPreference = 'Stop'
$fe = 'http://localhost:3000'
$api = 'http://localhost:5000/api/v1'
$script:fails = 0

function Check($label, $condition, $detail) {
  if ($condition) { Write-Output "  PASS  $label" }
  else { Write-Output "  FAIL  $label  -> $detail"; $script:fails++ }
}
function Api($path) { Invoke-RestMethod "$api$path" }
function Page($path) {
  try { return (Invoke-WebRequest "$fe$path" -UseBasicParsing).Content }
  catch { return "HTTP_$([int]$_.Exception.Response.StatusCode)" }
}

# Pick an available pet with several photos so the gallery is exercised properly.
$pet = (Api '/pets?status=available&limit=40').data | Where-Object { $_.images.Count -ge 3 } | Select-Object -First 1
if (-not $pet) { $pet = (Api '/pets?limit=1').data[0] }
$slug = $pet.slug
Write-Output "Testing pet: $($pet.name) ($slug), $($pet.images.Count) images"

Write-Output "`n=== 1. Detail API ==="
$d = (Api "/pets/$slug").data
Check "returns the pet" ($d.slug -eq $slug) "got $($d.slug)"
Check "includes full description" ($d.description.Length -gt 50) "len=$($d.description.Length)"
Check "includes detail-only fields" ($null -ne $d.activityLevel -and $null -ne $d.microchipped) 'missing'
Check "includes populated shelter" ($d.shelterDetail.name.Length -gt 0) 'shelter missing'
Check "shelter has rating + counts" ($null -ne $d.shelterDetail.rating.average -and $null -ne $d.shelterDetail.availablePets) 'missing'
Check "images carry dimensions" ($d.images[0].width -gt 0) 'no width'

Write-Output "`n=== 2. View counting ==="
$before = (Api "/pets/$slug").data.views
Start-Sleep -Milliseconds 400
$after = (Api "/pets/$slug").data.views
Check "views increment on fetch" ($after -gt $before) "$before -> $after"

Write-Output "`n=== 3. Similar pets ==="
$sim = (Api "/pets/$slug/similar").data
Check "similar accepts a slug" ($sim.Count -gt 0) 'none returned'
Check "never includes the pet itself" (($sim | Where-Object slug -eq $slug).Count -eq 0) 'self included'
Check "same species" (($sim | Where-Object species -ne $d.species).Count -eq 0) 'species mismatch'
Check "only available pets" (($sim | Where-Object status -ne 'available').Count -eq 0) 'unavailable included'

Write-Output "`n=== 4. Unknown pet is a 404, not a 500 ==="
try {
  $null = Invoke-RestMethod "$api/pets/definitely-not-a-real-pet-xyz"
  Check "API 404s on unknown slug" $false 'returned success'
} catch {
  Check "API 404s on unknown slug" ([int]$_.Exception.Response.StatusCode -eq 404) "got $([int]$_.Exception.Response.StatusCode)"
}
$missing = Page '/pets/definitely-not-a-real-pet-xyz'
Check "page renders the 404, not an error" ($missing -eq 'HTTP_404' -or $missing -match 'wandered off') "got $($missing.Substring(0,[Math]::Min(40,$missing.Length)))"

Write-Output "`n=== 5. Detail page renders ==="
$h = Page "/pets/$slug"
Check "page returns content" ($h -notmatch '^HTTP_') "got $h"
Check "pet name as the single h1" (([regex]::Matches($h, '<h1')).Count -eq 1) "found $(([regex]::Matches($h,'<h1')).Count)"
Check "breed shown" ($h -match [regex]::Escape($d.breed)) 'missing'
Check "description rendered" ($h -match [regex]::Escape($d.description.Substring(0, 40))) 'missing'
Check "shelter card rendered" ($h -match [regex]::Escape($d.shelterDetail.name)) 'missing'
Check "breadcrumb present" ($h -match 'aria-label="Breadcrumb"') 'missing'
Check "at-a-glance facts" ($h -match 'At a glance') 'missing'
Check "compatibility section" ($h -match 'Lives well with') 'missing'
Check "health section" ($h -match 'Vaccinated|Not vaccinated') 'missing'
Check "similar pets section" ($h -match 'More .* nearby') 'missing'

Write-Output "`n=== 6. Gallery ==="
Check "thumbnails rendered" (([regex]::Matches($h, 'Show photo \d')).Count -ge 2) "found $(([regex]::Matches($h,'Show photo \d')).Count)"
# The apostrophe in the label is HTML-escaped to &#x27;, so match around it rather than through it.
Check "lightbox trigger labelled" ($h -match 'aria-label="View [^"]*photos full screen"') 'missing'
Check "prev/next controls labelled" ($h -match 'aria-label="Next photo"') 'missing'
Check "photo counter present" ($h -match 'tabular-nums') 'missing'

Write-Output "`n=== 7. Adoption CTA ==="
Check "apply link present" ($h -match "/adopt/$([regex]::Escape($slug))") 'missing'
Check "adoption fee shown" ($h -match 'Adoption fee') 'missing'
Check "mobile sticky bar present" ($h -match 'Apply to adopt') 'missing'
Check "favourite button present" ($h -match 'data-pet-id=') 'missing'
Check "share button present" ($h -match '>Share<') 'missing'

Write-Output "`n=== 8. SEO ==="
Check "title includes name and city" ($h -match "<title>$([regex]::Escape($d.name)).*$([regex]::Escape($d.location.city))") 'wrong title'
Check "canonical points at the pet" ($h -match "rel=`"canonical`"[^>]*pets/$([regex]::Escape($slug))") 'missing'
Check "og:image is the pet photo" ($h -match 'property="og:image"') 'missing'
Check "twitter card is large image" ($h -match 'summary_large_image') 'missing'
Check "JSON-LD present" ($h -match 'application/ld\+json') 'missing'
Check "JSON-LD has offer + availability" ($h -match 'schema.org/InStock|schema.org/OutOfStock') 'missing'
Check "JSON-LD lists all photos" (([regex]::Matches($h, 'images.unsplash.com')).Count -ge $d.images.Count) 'missing'

Write-Output "`n=== 9. Adopted pets are noindex ==="
$adopted = (Api '/pets?status=adopted&limit=1').data
if ($adopted.Count -gt 0) {
  $ha = Page "/pets/$($adopted[0].slug)"
  Check "adopted pet page still reachable" ($ha -notmatch '^HTTP_') 'not reachable'
  Check "adopted pet is noindex" ($ha -match 'name="robots"[^>]*noindex') 'still indexable'
  Check "adopted pet hides the apply CTA" ($ha -match 'has found a home|not accepting new applications') 'CTA still shown'
} else {
  Write-Output "  SKIP  no adopted pets in the dataset"
}

Write-Output "`n=== 10. Accessibility ==="
$imgTags = [regex]::Matches($h, '<img[^>]*>')
Check "every img has alt" ((($imgTags | Where-Object { $_.Value -notmatch 'alt=' }).Count) -eq 0) 'missing alt'
Check "sections labelled" (([regex]::Matches($h, 'aria-labelledby=')).Count -ge 5) 'too few'
Check "decorative icons hidden" ($h -match 'aria-hidden="true"') 'missing'
Check "compatibility has text equivalent" ($h -match 'Good with|Not suited to|Unknown with') 'missing'

Write-Output "`n================================"
if ($script:fails -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "$($script:fails) CHECK(S) FAILED" }
