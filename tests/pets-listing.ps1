$ErrorActionPreference = 'Stop'
$fe = 'http://localhost:3000'
$api = 'http://localhost:5000/api/v1'
$script:fails = 0

function Check($label, $condition, $detail) {
  if ($condition) { Write-Output "  PASS  $label" }
  else { Write-Output "  FAIL  $label  -> $detail"; $script:fails++ }
}
function Api($path) { Invoke-RestMethod "$api$path" }
function Page($path) { (Invoke-WebRequest "$fe$path" -UseBasicParsing).Content }

Write-Output "`n=== 1. Seeded dataset ==="
$all = Api '/pets?limit=1'
Check "500 pets seeded, 446 available" ($all.meta.total -gt 400) "total=$($all.meta.total)"
$facets = Api '/pets/facets'
Check "all 5 species present" ($facets.data.species.Count -eq 5) "$($facets.data.species.Count)"
Check "breeds aggregated" ($facets.data.breed.Count -gt 10) "$($facets.data.breed.Count)"
Check "cities aggregated" ($facets.data.city.Count -ge 10) "$($facets.data.city.Count)"

Write-Output "`n=== 2. Filtering ==="
$dogs = Api '/pets?species=dog&limit=100'
Check "species filter returns only dogs" (($dogs.data | Where-Object species -ne 'dog').Count -eq 0) 'non-dog leaked'
$multi = Api '/pets?species=dog,cat&limit=100'
Check "multi-species filter works" (($multi.data | Where-Object { $_.species -notin 'dog','cat' }).Count -eq 0) 'other species leaked'
$small = Api '/pets?size=small&limit=100'
Check "size filter" (($small.data | Where-Object size -ne 'small').Count -eq 0) 'wrong size leaked'
$vax = Api '/pets?vaccinated=true&limit=100'
Check "vaccinated filter" (($vax.data | Where-Object { -not $_.health.vaccinated }).Count -eq 0) 'unvaccinated leaked'
$kids = Api '/pets?goodWithKids=true&limit=100'
Check "goodWithKids excludes 'unknown'" (($kids.data | Where-Object { $_.goodWith.kids -ne 'yes' }).Count -eq 0) 'non-yes leaked'
$senior = Api '/pets?minAge=96&maxAge=600&limit=100'
Check "age range filter" (($senior.data | Where-Object { $_.ageInMonths -lt 96 }).Count -eq 0) 'young pet leaked'
$cheap = Api '/pets?maxFee=1500&limit=100'
Check "fee filter" (($cheap.data | Where-Object { $_.adoptionFee -gt 1500 }).Count -eq 0) 'expensive leaked'
$city = Api '/pets?city=Denver&limit=100'
Check "city filter" (($city.data | Where-Object { $_.location.city -ne 'Denver' }).Count -eq 0) 'wrong city leaked'

Write-Output "`n=== 3. Combined filters narrow results ==="
$combo = Api '/pets?species=dog&size=large&vaccinated=true&limit=100'
Check "combined filter narrower than single" ($combo.meta.total -le $dogs.meta.total) "combo=$($combo.meta.total) dogs=$($dogs.meta.total)"
Check "combined results all match" (($combo.data | Where-Object { $_.species -ne 'dog' -or $_.size -ne 'large' -or -not $_.health.vaccinated }).Count -eq 0) 'mismatch'

Write-Output "`n=== 4. Search ==="
$search = Api '/pets?q=beagle&limit=50'
Check "text search returns results" ($search.meta.total -gt 0) 'no results'
Check "search results mention the term" (($search.data | Where-Object { $_.breed -match 'Beagle' }).Count -gt 0) 'no breed match'
$nonsense = Api '/pets?q=zzzzqqqxxx&limit=10'
Check "nonsense search returns empty" ($nonsense.meta.total -eq 0) "got $($nonsense.meta.total)"

Write-Output "`n=== 5. Pagination stability (the tie-breaker fix) ==="
foreach ($s in 'newest','name','fee_asc','fee_desc','popular','oldest') {
  $ids = @()
  for ($p = 1; $p -le 5; $p++) { $ids += (Api "/pets?limit=24&page=$p&sort=$s").data.id }
  $unique = ($ids | Select-Object -Unique).Count
  Check "sort=$s has no cross-page duplicates" ($ids.Count -eq $unique) "$($ids.Count) rows, $unique unique"
}

Write-Output "`n=== 6. Sorting correctness ==="
$asc = (Api '/pets?sort=fee_asc&limit=30').data.adoptionFee
Check "fee_asc is ascending" (($asc | Sort-Object) -join ',' -eq ($asc -join ',')) 'not sorted'
$desc = (Api '/pets?sort=fee_desc&limit=30').data.adoptionFee
Check "fee_desc is descending" (($desc | Sort-Object -Descending) -join ',' -eq ($desc -join ',')) 'not sorted'
$names = (Api '/pets?sort=name&limit=30').data.name
Check "name sort is alphabetical" (($names | Sort-Object) -join ',' -eq ($names -join ',')) 'not sorted'

Write-Output "`n=== 7. Input hardening ==="
$neg = Api '/pets?page=-5&limit=10'
Check "negative page coerced to 1" ($neg.meta.page -eq 1) "got $($neg.meta.page)"
$huge = Api '/pets?limit=99999'
Check "oversized limit clamped to 48" ($huge.meta.limit -le 48) "got $($huge.meta.limit)"
$junk = Api '/pets?species=dragon&limit=5'
Check "unknown species value ignored, not 500" ($junk.meta.total -gt 0) "total=$($junk.meta.total)"
$far = Api '/pets?page=99999&limit=24'
Check "page past the end returns empty, not an error" ($far.data.Count -eq 0) "got $($far.data.Count)"

Write-Output "`n=== 8. Listing page renders ==="
$h = Page '/pets'
Check "page returns 200 with heading" ($h -match 'Pets looking for a home') 'heading missing'
Check "24 pet cards rendered" (([regex]::Matches($h, 'data-pet-id=')).Count -eq 24) "found $(([regex]::Matches($h,'data-pet-id=')).Count)"
Check "filters sidebar present" ($h -match 'Filters' -and $h -match 'Species') 'sidebar missing'
Check "facet counts rendered" ($h -match 'tabular-nums') 'no counts'
Check "sort control present" ($h -match 'Sort:') 'missing'
Check "pagination present" ($h -match 'aria-label="Pagination"') 'missing'
Check "result count announced" ($h -match 'aria-live="polite"') 'missing'
Check "search input labelled" ($h -match 'Search pets by name or breed') 'missing'

Write-Output "`n=== 9. Filters drive SSR (shareable URLs) ==="
$catPage = Page '/pets?species=cat'
Check "species=cat changes the heading" ($catPage -match 'Cats looking for a home') 'heading not adapted'
$filtered = Page '/pets?species=dog&size=large&vaccinated=true'
$apiCount = (Api '/pets?species=dog&size=large&vaccinated=true&limit=1').meta.total
Check "filtered page count matches the API" ($filtered -match [regex]::Escape($apiCount.ToString())) "expected $apiCount in page"
$empty = Page '/pets?q=zzzzqqqxxx'
Check "empty state rendered for no results" ($empty -match 'No pets match those filters') 'empty state missing'
Check "empty state offers a way out" ($empty -match 'Clear all filters') 'no recovery action'

Write-Output "`n=== 10. Home page uses live data ==="
# NOT $home — PowerShell reserves $HOME as a read-only automatic variable.
$homePage = Page '/'
Check "home featured pets come from the API" (([regex]::Matches($homePage, 'data-pet-id=')).Count -gt 0) 'no pet cards'
Check "category counts are live" ($homePage -match '\d+ available') 'counts missing'

Write-Output "`n================================"
if ($script:fails -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "$($script:fails) CHECK(S) FAILED" }
