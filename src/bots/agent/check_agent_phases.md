# Check Agent — Phase Checklists

## Phase 0: Run History Analysis
- [ ] Read `src/bots/agent/run_history.jsonl`
- [ ] Parse entries for target bot variant
- [ ] Compute: last run result, 5-run distribution, most common failure, persistent failures, auth status
- [ ] Decide: SKIP or RUN
- [ ] If SKIP: state reason, jump to Phase 4

## Phase 1: Pre-flight Checks
- [ ] Verify Chrome is running (`openclaw browser snapshot`)
- [ ] Verify MongoDB connection (query one document)
- [ ] Check corpus-rag API health
- [ ] Check bot login/session state (snapshot relevant page)
- [ ] Log all findings as `_preflight` on context

## Phase 2: Find Test Job
- [ ] Query MongoDB for unapplied EA jobs on target platform
- [ ] Cross-ref with run_history.jsonl (exclude last 3 tested)
- [ ] Pick freshest untested EA job
- [ ] If none: pick oldest unapplied, or switch to extract-only

## Phase 2.5: Config Sanity
- [ ] Check keywords/location not empty
- [ ] Check minSalary formatting
- [ ] Check botMode vs superbot consistency
- [ ] Check config file modification dates
- [ ] Check git state (uncommitted changes, open branches)
- [ ] Report warnings, ask to proceed

## Phase 3: Run & Classify
- [ ] Run bot with test job URL
- [ ] Capture all step results from `_steps_executed` and `_steps_failed`
- [ ] Classify each failure using engine's failure_type
- [ ] Determine overall result: all_pass / partial_pass / all_fail / crashed

## Phase 4: Repair
- [ ] For each failed step, determine if it's PERSISTENT (seen before) or REGRESSION (new)
- [ ] Prioritize: PERSISTENT issues first (design problems), then REGRESSION
- [ ] Create repair branch: `repair/{bot}-YYYY-MM-DD`
- [ ] Apply fixes surgically
- [ ] Re-test after each fix
- [ ] If fix works: commit with descriptive message
- [ ] If 3 attempts fail: document as known issue, skip

## Phase 5: Report
- [ ] Summarize: what was tested, what passed, what failed
- [ ] Include trend context: PERSISTENT vs REGRESSION vs FIX_CONFIRMED
- [ ] Show failure_type distribution
- [ ] Recommend next actions
- [ ] Update MEMORY.md with findings
