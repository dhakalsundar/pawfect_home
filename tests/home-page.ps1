$ErrorActionPreference = 'Stop'
$fe = 'http://localhost:3000'
$api = 'http://localhost:5000/api/v1'
$script:fails = 0

function Check($label, $condition, $detail) {
  if ($condition) { Write-Output "  PASS  $label" }
  else { Write-Output "  FAIL  $label  -> $detail"; $script:fails++ }
}

$h = (Invoke-WebRequest -Uri $fe -UseBasicParsing).Content

Write-Output "`n=== 1. All 13 sections present ==="
$sections = @(
  @{ n='Hero';             m='a family like yours' },
  @{ n='Trusted orgs';     m='Trusted by shelters' },
  @{ n='Featured pets';    m='Pets looking for a home' },
  @{ n='Categories';       m='Who are you looking for' },
  @{ n='Why adopt';        m='A rescue is not second best' },
  @{ n='Stats';            m='Pets rehomed' },
  @{ n='How it works';     m='Four steps to a new companion' },
  @{ n='Success stories';  m='They found their people' },
  @{ n='Happy families';   m='Life after adoption' },
  @{ n='Testimonials';     m='What adopters and shelters say' },
  @{ n='Donation banner';  m='Not ready to adopt' },
  @{ n='Care tips';        m='Advice from people who do this daily' },
  @{ n='Newsletter';       m='New pets, once a month' }
)
foreach ($s in $sections) { Check "$($s.n) section" ($h -match [regex]::Escape($s.m)) 'copy not found' }

Write-Output "`n=== 2. Content rendered ==="
# Featured pets come from the live API as of Batch 4, so assert on structure rather than on the
# names that used to be hardcoded placeholders.
$petCards = ([regex]::Matches($h, 'data-pet-id=')).Count
Check "featured pets rendered from the API" ($petCards -ge 4) "found $petCards"
Check "each card links to a pet detail page" (([regex]::Matches($h, 'href="/pets/[a-z0-9-]+"')).Count -ge 4) 'no detail links'
Check "5 category tiles" (([regex]::Matches($h, 'pets\?species=')).Count -ge 5) 'missing'
Check "3 success stories" ($h -match 'Biscuit' -and $h -match 'Mango' -and $h -match 'Scout') 'missing'
Check "4 testimonials" ($h -match 'Amara Johnson' -and $h -match 'Sofia Lindqvist') 'missing'
Check "3 care tips" ($h -match 'first 72 hours' -and $h -match 'senior pet') 'missing'

Write-Output "`n=== 3. Images optimised through next/image ==="
$imgs = [regex]::Matches($h, '/_next/image\?url=')
Check "images routed via next/image" ($imgs.Count -ge 20) "found $($imgs.Count)"
Check "responsive srcset emitted" ($h -match 'srcSet=|srcset=') 'no srcset'
Check "explicit sizes attribute" ($h -match 'sizes=') 'no sizes'
Check "below-fold images lazy-loaded" ($h -match 'loading="lazy"') 'none lazy'
Check "hero image marked high priority" ($h -match 'fetchPriority') 'no fetchPriority attribute'
Check "LCP image preloaded in head" ($h -match 'rel="preload"[^>]*as="image"') 'no image preload'

Write-Output "`n=== 4. Accessibility ==="
Check "single h1 on the page" (([regex]::Matches($h, '<h1')).Count -eq 1) "found $(([regex]::Matches($h,'<h1')).Count)"
Check "sections are labelled" (([regex]::Matches($h, 'aria-labelledby=')).Count -ge 8) 'too few labelled sections'
Check "decorative icons hidden" ($h -match 'aria-hidden="true"') 'missing'
Check "favourite buttons have labels" ($h -match 'aria-label="Save .* to favourites"') 'missing'
Check "star rating has text equivalent" ($h -match 'out of 5 stars') 'missing'
Check "honeypot hidden from AT" ($h -match 'Leave this field empty') 'honeypot missing'
Check "skip link present" ($h -match 'Skip to content') 'missing'
$imgTags = [regex]::Matches($h, '<img[^>]*>')
$missingAlt = ($imgTags | Where-Object { $_.Value -notmatch 'alt=' }).Count
Check "every img has an alt attribute" ($missingAlt -eq 0) "$missingAlt image(s) missing alt"

Write-Output "`n=== 5. CLS protection ==="
Check "no raw <img> without dimensions" (($imgTags | Where-Object { $_.Value -notmatch 'width=|style=' }).Count -eq 0) 'unsized image found'

Write-Output "`n=== 6. SEO ==="
Check "canonical link" ($h -match 'rel="canonical"') 'missing'
Check "og:title" ($h -match 'property="og:title"') 'missing'
Check "og:description" ($h -match 'property="og:description"') 'missing'
Check "twitter card" ($h -match 'name="twitter:card"') 'missing'
Check "JSON-LD structured data" ($h -match 'application/ld\+json') 'missing'
Check "JSON-LD has SearchAction" ($h -match 'SearchAction') 'missing'
# Matches loosely around the em dash — this file's encoding cannot be relied on to round-trip it.
Check "descriptive page title" ($h -match '<title>PawfectHome .{1,3} Adopt a pet from a verified shelter') 'wrong title'

Write-Output "`n=== 7. Newsletter endpoint ==="
# The newsletter shares the `sensitive` rate limiter (5/hr) with password reset, so running this
# suite after the auth suites can exhaust it. Detect that and skip rather than report false
# failures — restart the backend to reset the in-memory limiter.
function Post-Newsletter($body) {
  try {
    $resp = Invoke-WebRequest -Uri "$api/newsletter" -Method POST -UseBasicParsing -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress)
    return [pscustomobject]@{ Status = [int]$resp.StatusCode; Body = $resp.Content }
  } catch {
    return [pscustomobject]@{ Status = [int]$_.Exception.Response.StatusCode; Body = $_.ErrorDetails.Message }
  }
}

# The 5-per-hour budget can run out partway through this section, so each call is checked for a
# 429 individually. Written inline rather than via a helper that returns a boolean: in PowerShell a
# function emits *everything* it writes, so `if (Helper ...)` would test an array containing the
# Write-Output text and be truthy regardless of the actual result.
function Skip-RateLimited($label) {
  Write-Output "  SKIP  $label - rate limited (restart the backend to reset)"
}

$email = "news$(Get-Random -Maximum 999999)@example.com"

$r = Post-Newsletter @{ email = $email; source = 'test' }
if ($r.Status -eq 429) { Skip-RateLimited 'subscribe returns 200' }
else { Check "subscribe returns 200" ($r.Status -eq 200) "got $($r.Status)" }

$r2 = Post-Newsletter @{ email = $email; source = 'test' }
if ($r2.Status -eq 429) { Skip-RateLimited 're-subscribe is idempotent' }
else { Check "re-subscribe is idempotent (no 409)" ($r2.Status -eq 200) "got $($r2.Status)" }

$bad = Post-Newsletter @{ email = 'not-an-email' }
if ($bad.Status -eq 429) { Skip-RateLimited 'invalid email rejected' }
else { Check "invalid email rejected" ($bad.Status -eq 422) "got $($bad.Status)" }

# A filled honeypot must look identical to a normal success. Returning a validation error would
# name the field and teach the bot which input to leave alone next time.
$r3 = Post-Newsletter @{ email = "bot$(Get-Random)@example.com"; website = 'http://spam.example' }
if ($r3.Status -eq 429 -or $r.Status -ne 200) {
  Skip-RateLimited 'honeypot behaviour'
} else {
  Check "honeypot submission accepted silently" ($r3.Status -eq 200) "got $($r3.Status) - this leaks the trap"
  Check "honeypot response identical to a real one" ($r3.Body -eq $r.Body) "differs: $($r3.Body)"
}

Write-Output "`n================================"
if ($script:fails -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "$($script:fails) CHECK(S) FAILED" }
