# Fixes Applied - Overlay & Config Issues

## 🔥 Critical Issues Found & Fixed

### Issue #1: ❌ Config Structure Missing LinkedIn Fields
**Problem:** `user-bots-config.json` only had Seek fields, LinkedIn would fail

**Fix Applied:**
```json
// Added linkedin section to config
{
  "formData": { ... }, // Seek fields
  "linkedin": {        // NEW - Added for LinkedIn
    "username": "",
    "password": "",
    "search_location": "Sydney, Australia",
    "search_keywords": "Software Engineer",
    "easy_apply_only": true,
    "resume_path": "",
    "phone": "",
    "email": ""
  }
}
```

**Files Changed:**
- ✅ `src/bots/core/user-bots-config.json` - Added linkedin section

---

### Issue #2: ❌ Overlay Constructor Signature Mismatches
**Problem:** 3 locations still using old constructor without bot name

**Found:**
1. `workflow_engine.ts` line 138: `new UniversalOverlay(driver)` ❌
2. `workflow_engine.ts` line 203: `new UniversalOverlay(driver)` ❌
3. `seek_impl.ts` line 168: `new UniversalOverlay(driver)` ❌

**Fix Applied:**
```typescript
// OLD (broken)
new UniversalOverlay(driver)

// NEW (fixed)
new UniversalOverlay(driver, 'BotName')

// OR use existing ctx.overlay
await ctx.overlay.showSignInOverlay()
```

**Files Changed:**
- ✅ `src/bots/seek/seek_impl.ts` - Use `ctx.overlay` instead of creating new instance
- ✅ `src/bots/core/workflow_engine.ts` - Use `ctx.overlay` when available, create fallback with bot name

---

### Issue #3: ❌ Workflow Engine Conflicts with Bot Overlays
**Problem:** Workflow engine created its own overlay, conflicting with bot's overlay

**Original Logic:**
```typescript
// workflow_engine always created its own overlay
if (this.context.driver) {
  this.overlay = new UniversalOverlay(this.context.driver);
}
```

**Fixed Logic:**
```typescript
// Prefer bot's overlay, fallback to workflow overlay if needed
const activeOverlay = this.context.overlay || this.overlay;

// Only create fallback if bot didn't create one
if (!this.context.overlay && !this.overlay && this.context.driver) {
  this.overlay = new UniversalOverlay(this.context.driver, 'Workflow');
}
```

**Benefits:**
- ✅ Bots control their own overlays (job progress, sign-in, etc.)
- ✅ Workflow engine uses bot's overlay if available
- ✅ Fallback overlay created only if needed
- ✅ No conflicts or duplicate overlays

**Files Changed:**
- ✅ `src/bots/core/workflow_engine.ts` - 3 locations updated to prefer `ctx.overlay`

---

## ✅ Files Modified Summary

| File | Changes | Status |
|------|---------|--------|
| `user-bots-config.json` | Added linkedin section | ✅ Fixed |
| `seek_impl.ts` | Use ctx.overlay in showSignInBanner | ✅ Fixed |
| `workflow_engine.ts` | Prefer ctx.overlay, add bot name to fallback | ✅ Fixed |
| `linkedin_impl.ts` | Already correct (bot name in constructor) | ✅ OK |

---

## 🧪 Verification Checklist

Before running bots:

### Configuration
- [x] LinkedIn section exists in `user-bots-config.json`
- [ ] **TODO:** User needs to fill in LinkedIn credentials:
  - `username`: LinkedIn email
  - `password`: LinkedIn password
  - `resume_path`: Full path to resume PDF (optional)
  - `phone`: Phone number (optional)
  - `email`: Contact email (optional)

### Code
- [x] All `new UniversalOverlay()` calls include bot name
- [x] Seek bot uses `ctx.overlay`
- [x] LinkedIn bot uses `ctx.overlay`
- [x] Workflow engine prefers `ctx.overlay`
- [x] No duplicate overlay creation

### Runtime Tests Needed
- [ ] Run Seek bot: `bun src/bots/bot_starter.ts seek`
  - Verify overlay appears with "Seek Bot" title
  - Verify overlay persists across navigation
  - Verify sign-in overlay works
- [ ] Run LinkedIn bot: `bun src/bots/bot_starter.ts linkedin`
  - Verify overlay appears with "LinkedIn Bot" title
  - Verify credential login works (after filling config)
  - Verify overlay persists across navigation

---

## 📋 Remaining Issues (Non-Breaking)

### 1. Cross-Tab Overlay Persistence
**Current:** Overlay uses `sessionStorage` (tab-specific)

**Impact:**
- When Seek opens Quick Apply in **new tab**, overlay state doesn't transfer
- Overlay will reinject from scratch in new tab
- Not a bug, but worth noting

**Possible Enhancement:**
- Switch to `localStorage` for cross-tab persistence
- Or: Don't persist overlay in new tabs (current behavior might be intentional)

### 2. LinkedIn Config Empty by Default
**Current:** LinkedIn fields are empty strings

**Impact:**
- LinkedIn will go to manual login every time
- User needs to manually fill credentials in config

**Recommendation:**
- Document this clearly
- Consider environment variables for sensitive data
- Or: Build a config UI for users

### 3. Config Validation Missing
**Current:** No validation that required fields are filled

**Impact:**
- Bot may fail with cryptic errors if config invalid
- Hard to debug for users

**Recommendation:**
- Add validation in `step0` functions
- Fail fast with helpful error messages

---

## 🎯 Testing Commands

```bash
# Test Seek bot
bun src/bots/bot_starter.ts seek

# Test LinkedIn bot (fill credentials first!)
bun src/bots/bot_starter.ts linkedin

# Check for overlay usage
grep -r "new UniversalOverlay" src/bots/ --include="*.ts"

# Should only show:
# - seek_impl.ts line 68: ctx.overlay = new UniversalOverlay(driver, 'Seek');
# - linkedin_impl.ts line 52: ctx.overlay = new UniversalOverlay(driver, 'LinkedIn');
# - workflow_engine.ts (3 times with 'Workflow' or using ctx.overlay)
```

---

## 📝 Summary

**Critical Issues Fixed:** 3
**Files Modified:** 3
**Config Updated:** 1

**Both bots now:**
- ✅ Use same unified config file
- ✅ Create overlay with correct bot name
- ✅ Share overlay system across all URLs
- ✅ Persist overlay state across navigation
- ✅ No conflicts or duplicates

**Next Steps:**
1. Fill in LinkedIn credentials in config
2. Test both bots end-to-end
3. Verify overlay persistence works
4. Optional: Add config validation

---

## 🚀 Ready to Test!

All critical issues fixed. The system is now ready for testing!
