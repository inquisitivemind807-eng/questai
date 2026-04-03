# `src/lib` Usage Audit

> Thoroughness: checked every file against all [.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/+page.svelte), [.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/app.d.ts), [.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/auth.js) files in the entire `src/` tree.

---

## ✅ Actively Used (imported by routes or bots)

| File | Used by |
|---|---|
| [authService.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/authService.js) | [+layout.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/+layout.svelte), `login`, `reset-password`, `cover-letters`, `resume-enhancement`, `files`, `plans`, `app`, [+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/+page.svelte), `job-analytics/[id]`, `api-test`, tests, [tokenService.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/services/tokenService.js), [planService.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/services/planService.js) |
| [api-config.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/api-config.js) | [auth.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/auth.js) (internal), [tokenService.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/services/tokenService.js), [routes/generic-questions/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/generic-questions/+page.svelte) |
| [auth-check.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/auth-check.js) | [routes/unauthorized/+page.server.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/unauthorized/+page.server.js) |
| [canonical-resume.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/canonical-resume.ts) | [linkedin_impl.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/linkedin/linkedin_impl.ts), [seek/handlers/intelligent_qa_handler.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/seek/handlers/intelligent_qa_handler.ts), [resume_handler.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/seek/handlers/resume_handler.ts), [cover_letter_handler.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/seek/handlers/cover_letter_handler.ts) |
| [corpus-rag-auth.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/corpus-rag-auth.js) | [+layout.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/+layout.svelte), [job-application-handler.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/job-application-handler.js) (internal), [corpus-rag-client.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/corpus-rag-client.js) (internal) |
| [file-manager.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/file-manager.ts) | [routes/files/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/files/+page.svelte), [routes/frontend-form/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/frontend-form/+page.svelte), [components/JobTrackerBase.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/components/JobTrackerBase.svelte), [file-manager-utils.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/file-manager-utils.ts) |
| [file-manager-utils.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/file-manager-utils.ts) | [routes/files/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/files/+page.svelte) |
| [file-manager-utils.test.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/file-manager-utils.test.ts) | Test file (self-contained) |
| [file-manager.test.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/file-manager.test.ts) | Test file (self-contained) |
| [session.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/session.js) | [routes/api/session/+server.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/api/session/+server.js) |
| **components/BotDashboard.svelte** | [routes/bot-logs/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/bot-logs/+page.svelte) |
| **components/ScrollToTop.svelte** | [routes/+layout.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/+layout.svelte) |
| **components/TokenBalance.svelte** | [routes/+layout.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/+layout.svelte) |
| **components/JobTrackerBase.svelte** | `seek-job-tracker`, `linkedin-job-tracker`, `job-analytics`, `indeed-job-tracker` |
| **services/orderService.js** | [routes/orders/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/orders/+page.svelte), `routes/orders/[orderId]/+page.svelte` |
| **services/planService.js** | [routes/plans/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/plans/+page.svelte) |
| **services/tokenService.js** | `job-analytics/[id]`, `tokens/history`, [stores/tokenStore.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/stores/tokenStore.js), [components/JobTrackerBase.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/components/JobTrackerBase.svelte) |
| **stores/botProgressStore.ts** | `routes/bot-logs`, `routes/choose-bot`, [routes/+layout.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/+layout.svelte), [components/BotDashboard.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/components/BotDashboard.svelte) |
| **stores/tokenStore.js** | `routes/plans`, `routes/payment/success`, `routes/tokens/history`, [components/TokenBalance.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/components/TokenBalance.svelte) |
| **resume/store.ts** | [resume-builder/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/resume-builder/+page.svelte), [my-resumes/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/resume-builder/my-resumes/+page.svelte), `edit/[id]/+page.svelte` |
| **resume/generator.ts** | [my-resumes/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/resume-builder/my-resumes/+page.svelte), `edit/[id]/+page.svelte` |
| **resume/types.ts** | `edit/[id]/+page.svelte`, [my-resumes/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/resume-builder/my-resumes/+page.svelte) |
| **resume/templates/index.ts** | [resume-builder/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/resume-builder/+page.svelte), `edit/[id]/+page.svelte` |
| **resume/templates/configs.ts** | (imported by [templates/index.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/templates/index.ts)) |
| **resume/components/TemplatePreview.svelte** | [resume-builder/+page.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/routes/resume-builder/+page.svelte) |
| **resume/utils/font-helpers.ts** | [resume/generator.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/generator.ts), `resume-builder/edit/[id]/+page.svelte`, [resume/components/ResumeRenderer.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/components/ResumeRenderer.svelte) |
| **resume/utils/bullet-styles.ts** | [resume/generator.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/generator.ts), [resume/components/ResumeRenderer.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/components/ResumeRenderer.svelte) |
| **resume/utils/date-formatter.ts** | [resume/generator.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/generator.ts), [resume/components/ResumeRenderer.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/components/ResumeRenderer.svelte) |
| **resume/fonts.ts** | [resume/utils/font-helpers.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/utils/font-helpers.ts), [resume/components/FontControls.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/components/FontControls.svelte) |

---

## 🔶 Transitively Used (inside lib, but never directly imported by routes)

These are only imported from within other `lib` files — they're needed, but not directly by routes.

| File | Who imports it |
|---|---|
| [corpus-rag-client.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/corpus-rag-client.js) | (DEPRECATED) Only used by [job-application-handler.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/job-application-handler.js) |
| [resume/fonts.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/fonts.ts) | [font-helpers.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/utils/font-helpers.ts) |
| [resume/utils/bullet-styles.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/utils/bullet-styles.ts) | [generator.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/generator.ts), [ResumeRenderer.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/deprecated/ResumeRenderer.svelte) (DEPRECATED) |
| [resume/utils/date-formatter.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/utils/date-formatter.ts) | [generator.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/generator.ts), [ResumeRenderer.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/deprecated/ResumeRenderer.svelte) (DEPRECATED) |
| [resume/templates/configs.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/templates/configs.ts) | [templates/index.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/templates/index.ts) |

---

## 🔴 Deprecated Files (Moved to `src/lib/deprecated/`)

The following files have been moved to the `deprecated` folder as they were confirmed to have zero actual usages in the runtime routes or active bots:

| File | Former Path | Verdict |
|---|---|---|
| [auth.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/auth.js) | [src/lib/auth.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/auth.js) | Superseded by [authService.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/authService.js) |
| [job-application-handler.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/job-application-handler.js) | [src/lib/job-application-handler.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/job-application-handler.js) | Never imported |
| [route-guard.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/route-guard.js) | [src/lib/route-guard.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/route-guard.js) | Never referenced |
| [corpus-rag-client.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/corpus-rag-client.js) | [src/lib/corpus-rag-client.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/corpus-rag-client.js) | Orphaned (only used by job-application-handler) |
| [AdminGuard.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/deprecated/AdminGuard.svelte) | [src/lib/components/AdminGuard.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/components/AdminGuard.svelte) | Zero references |
| [DraggablePanel.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/deprecated/DraggablePanel.svelte) | [src/lib/resume/components/DraggablePanel.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/components/DraggablePanel.svelte) | Zero references |
| [FontControls.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/deprecated/FontControls.svelte) | [src/lib/resume/components/FontControls.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/components/FontControls.svelte) | Zero references |
| [ResumeRenderer.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/deprecated/ResumeRenderer.svelte) | [src/lib/resume/components/ResumeRenderer.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/components/ResumeRenderer.svelte) | Zero references |

---

## Summary

| Category | Count |
|---|---|
| ✅ Actively used (directly by routes/bots) | 22 |
| 🔶 Transitively used (only within lib) | 5 |
| ❌ Dead code (zero usages) | 7 |
| ⚠️ Data file, runtime dependency | 1 |

### 🗑️ Safe to Delete
```
src/lib/auth.js
src/lib/job-application-handler.js
src/lib/route-guard.js
src/lib/components/AdminGuard.svelte
src/lib/components/DraggablePanel.svelte
src/lib/components/FontControls.svelte      ← was likely for resume-builder before ResumeRenderer was abandoned
src/lib/components/ResumeRenderer.svelte    ← renderer moved elsewhere or not yet wired up
```

> [!NOTE]
> [corpus-rag-client.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/corpus-rag-client.js) is only pulled in by the dead [job-application-handler.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/job-application-handler.js). If you delete the handler, [corpus-rag-client.js](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/corpus-rag-client.js) also becomes dead.

> [!WARNING]
> [components/ResumeRenderer.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/components/ResumeRenderer.svelte) and [components/FontControls.svelte](file:///home/wagle/inquisitive_mind/jobapps/questai/src/lib/resume/components/FontControls.svelte) appear to be **planned but not yet wired up** resume components (they import from `resume/` utils). Double-check the `resume-builder` route before deleting — they may be intended for future use.
