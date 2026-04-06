---
name: Job Fit Scoring
description: Evaluates job descriptions against the user profile and returns a fit score.
---

# Instructions

For each job posting:
1. Run an evaluation via Claude combining the given job description and your profile context.
2. Return a fit score between 1 and 10, along with a reason.
3. **Only apply to jobs that receive a score of 6 or higher.**
