# Jora Extraction Fix Plan

**Created:** 2026-06-02
**Status:** Needs live page inspection before coding

---

## Current State

- 105 jobs extracted, all with rich descriptions (side panel scraping works ✅)
- MongoDB collection: `inquisitive_mind.jora_jobs`

---

## Issues Found

### 🔴 Bug 1 — `externalApplyUrl` is always null or garbage (105/105 jobs broken)

**Impact:** Apply flow is dead. `--url` param needs valid employer URL.

**Root cause:** The `externalApplyButton` selectors in `jora_selectors.json` are matching a Jora-internal link instead of the employer apply button. Raw data shows it grabs URLs like:
```
https://au.jora.com/j?disallow=true&l=sydney&p=2&q=developer&surl=0&tk=...
```
That's a search results URL, not an employer redirect.

**Code location:** `src/bots/jora/jora_impl.ts` lines ~558-567 — after clicking a card to open side panel, it runs:
```typescript
const applySelectors = resolveSelector(ctx.selectors, 'jobDetails.externalApplyButton');
const applyEl = await findFirst(driver, applySelectors);
if (applyEl) {
  externalApplyUrl = await applyEl.getAttribute('href') || null;
}
```

**Current selectors** (`jora_selectors.json` → `jobDetails.externalApplyButton`):
```
a.rounded-button.-primary[data-utm]
a.rounded-button.-primary[href*="redirect"]
a[href*="utm_source=jora"]
a.rounded-button.-primary
a[data-js-apply-button]
a.apply-button
a:has-text("Apply")
button:has-text("Apply")
```

**What to investigate on the live page:**
1. Open a Jora job side panel (click a card on search results)
2. Find the actual "Apply" / "Apply on company site" button
3. Inspect its HTML — what's the element type, class, and href pattern?
4. Look for links containing `/redirect`, `/adclick`, `/job/...?apply=1`, or direct employer URLs
5. Check if there are multiple "Apply" links — which one is the real external one?

**Fix approach:**
- Add a more specific selector targeting the actual external apply link
- Add validation: if `href` is a Jora internal page (starts with `/j?` or doesn't contain `/redirect`), skip and continue searching

---

### 🔴 Bug 2 — `salary` and `jobType` are swapped (84/105 jobs wrong)

**Impact:** salary field has values like "Full time", "Contract", "Permanent" (job types). Actual salary numbers like "$110,000 - $140,000 a year" end up in the jobType field.

**Root cause:** In `jora_selectors.json`, BOTH `jobCards.salary` and `jobCards.jobType` use the exact same selector:
```json
"salary": ["div.badge.-default-badge div.content"],
"jobType": ["div.badge.-default-badge div.content"]
```

**Code location:** `src/bots/jora/jora_impl.ts` lines ~517-540:
```typescript
// salary extraction
const salarySelectors = resolveSelector(ctx.selectors, 'jobCards.salary');
const salaryEl = await findFirstInElement(card, salarySelectors);

// jobType extraction
const jtSelectors = resolveSelector(ctx.selectors, 'jobCards.jobType');
const jtEl = await findFirstInElement(card, jtSelectors);
```

Both `findFirstInElement` calls hit the same first `.badge.-default-badge` inside the card, so they read the same element.

**What to investigate on the live page:**
1. Inspect a job card on Jora search results
2. Look at the badges row — what CSS classes distinguish salary from job type?
3. Is there a separate salary badge class? (e.g., `.-salary-badge`, `.-compensation-badge`)
4. Does Jora even show salary on the card, or only in the side panel?
5. Check side panel — is salary shown there with a distinct selector?

**Fix approach:**
- Find the correct salary selector (card or side panel)
- Update `jora_selectors.json` → `jobCards.salary` to a distinct selector
- Verify `jobType` still uses the right badge selector

---

### 🟡 Bug 3 — `postedDate` is always epoch 0 (1970-01-01) (105/105 jobs wrong)

**Impact:** postedDate is useless. Raw text like "Posted 18h ago" is extracted but never parsed.

**Code location:** `src/bots/jora/jora_impl.ts` lines ~525-530:
```typescript
const dateSelectors = resolveSelector(ctx.selectors, 'jobCards.listingDate');
const dateEl = await findFirstInElement(card, dateSelectors);
if (dateEl) {
  postedDate = (await dateEl.getText()).trim(); // "Posted 18h ago"
}
```
The string `"Posted 18h ago"` is sent to the API as-is. Backend `new Date("Posted 18h ago")` returns epoch 0.

**What to investigate on the live page:**
1. Look at the listing date format on Jora cards — is it always "Posted Xh ago" / "Posted Xd ago"?
2. Are there other formats like "X hours ago", "X days ago", "Today", "Yesterday"?
3. Is there a `datetime` attribute on the element with an ISO date?

**Fix approach:**
- After extracting the text, parse it to a real Date before sending to API
- Parse patterns: "Posted Xh ago", "Posted Xd ago", "X hours ago", "X days ago", "Today", "Yesterday"
- OR: check if the element has a `datetime` or `title` attribute with an ISO timestamp

---

### 🟡 Bug 4 — `workMode` never extracted (105/105 missing)

**Impact:** No remote/hybrid/on-site data.

**Root cause:** The selectors file has `jobCards.workArrangementBadge` defined but the extraction code in `jora_impl.ts` never calls it. No `workMode` field exists in the job object.

**What to investigate on the live page:**
1. Look at job cards for work arrangement badges (Remote, Hybrid, On-site, WFH)
2. What's the CSS class and text content?
3. Is it in the card badges or only in the side panel?

**Fix approach:**
- Add extraction block in `jora_impl.ts` using `jobCards.workArrangementBadge` selector
- Add `workMode` to the job object sent to API

---

### 🟢 Minor — `applicationType` 5/105 wrong

**Impact:** 5 jobs marked `internal` because quick-apply badge was detected. But Jora's "Quick Apply" still redirects externally — there is no on-platform apply.

**Code location:** `src/bots/jora/jora_impl.ts` lines ~536-545:
```typescript
const qaSelectors = resolveSelector(ctx.selectors, 'jobCards.quickApplyBadge');
const qaEl = await findFirstInElement(card, qaSelectors);
if (qaEl) {
  isQuickApply = true;
}
// ...
const applicationType: 'internal' | 'external' = isQuickApply ? 'internal' : 'external';
```

**Fix:** Remove the quick-apply → internal mapping. All Jora applications are external.
```typescript
const applicationType = 'external'; // Jora always redirects externally
```
Keep `isQuickApply` as an info flag but don't let it change `applicationType`.

---

## Files to Modify

| File | What changes |
|---|---|
| `src/bots/jora/jora_selectors.json` | Fix salary selector, refine externalApplyButton selectors |
| `src/bots/jora/jora_impl.ts` | Add postedDate parsing, workMode extraction, fix applicationType, fix salary/jobType logic |

---

## Investigation Steps (do these first, before any code changes)

1. **Start Jora browser session** — the Chrome instance is likely still alive on port 58596 (check `sessions/jora/DevToolsActivePort`)
2. **Navigate to search results** — `https://au.jora.com/j?q=developer&l=sydney`
3. **For each issue above**, inspect the live DOM and find the correct selectors
4. **Document findings** in a comment on this file before touching code
