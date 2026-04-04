# Job Analytics / Jobs Report

## 1. Overview and Core Functionality
The Job Analytics feature in the QuestAI tracking application is a centralized system to manage, view, and analyze job applications discovered and applied to by autonomous bots. It provides an operational overview and aggregated analytics for a user's job hunt, allowing them to:
- Monitor jobs recently scraped by extraction bots.
- Filter and search through their application history.
- Run bulk applications via Tauri back-end automation.
- View specific application details including AI-generated artifacts (Cover Letters, Resumes, and Questionnaires) alongside API token transaction costs.

## 2. Supported Platforms
There is a unified architecture that handles data from all platforms, alongside platform-specific tracker views.
- **LinkedIn** (`/linkedin-job-tracker`)
- **Seek** (`/seek-job-tracker`)
- **Indeed** (`/indeed-job-tracker`)
- **Combined Overview** (`/jobs`)

Each platform-specific route renders the same underlying component class (`JobTrackerBase.svelte`), configured with a `platform` prop to filter rendering solely down to one platform's records. Both specific trackers and the global overview query the backend through endpoints `/api/jobs/<platform>` or `/api/job-applications`.

## 3. Data Contract & Table Structure (Columns)
Job data payload columns that define the main database table structure behind the analytics feature include:

### Main Top-Level Columns
- `platform`: `string` (e.g. seek, linkedin, indeed)
- `platformJobId`: `string`
- `status`: `string` (e.g., 'scraped', 'pending', 'applied', 'rejected', 'interview', 'offer')
- `title`: `string`
- `company`: `string`
- `url`: `string`
- `description`: `string`
- `location`: `string`
- `salary`: `string`
- `jobType`: `string`
- `workMode`: `string`
- `postedDate`: `string` (or date)
- `closingDate`: `string` (or date)
- `lastUpdatedAt`: `string` / `Date`
- `firstSeenAt`: `string` / `Date`

### Complex Data Structures (Often normalized as relationships or JSON columns)
- **Application Object**:
  - `appliedAt`: `Date` when application was officially submitted.
  - `coverLetter`: `string` (Generated cover letter text)
  - `tailoredResume`: `string` (Generated tailored resume text)
  - `questionAnswers`: `Array<{ question: string, answer: string, options?: string[], answerSource?: string }>`
  - `apiCalls`: `Array` containing `Task`, `inputTokens`, `outputTokens`, `tokensUsed`, `cost`, and `aiProvider`.
- **HR Contact Details** (`hrContact`): `name`, `email`, `phone`.
- **Requirements**: `requiredSkills` (Array), `requiredExperience` (string).
- **Source Config**: `jobFile` and `jobDir` paths representing raw local artifacts.

## 4. UI Breakdown (Tracker Base View)
The primary layout for trackers features four top-level tabs:

- **Jobs Tab**: Displays jobs exclusively where `status === 'scraped'`. It offers table filtering attributes like platform filters, search queries matching title/company, and chronological sorting (from/to dates). Paginated at 10 items/page. Shows checkboxes to bulk select jobs and launch the "Auto-Apply" overlay queue orchestrator via Tauri IPC.
- **Applied Tab**: Displays jobs already processed (`status !== 'scraped'`). Provides a status filter drop-down on top of the standard date and query filters. Sorted by `appliedAt` logic. 
- **Logs Tab**: Synthesizes a system-level event timeline listing occurrences like `[🔍 Job Discovered]` and `[🎉 Application Interview]`, dynamically derived from timestamp aggregations of job states.
- **Analytics Tab**: Employs `Chart.js` for data visualization displaying:
  - **Daily Applications**: A bar/line chart rendering a 14-day trailing volume.
  - **Weekly Momentum**: Grouping volume by 'Wk [Date]' tracing trailing weeks into a filled line-chart.
  - **Monthly Volume**: Aggregating applications into monthly buckets using bar charts indicating longer-term metrics.

## 5. UI Breakdown (Job Detail View)
The specific job detail view dynamically shifts from overview to raw insights context. Display headers map Title, Company, specific URL paths alongside essential bullet points (location, type, salary). Its internal routing switches between 4 analytical panes:

1. **Job details**: Grid layout highlighting salary/location, timeline dates (Posted / Closing), extracted HR contact logic, listed required skills, raw job description mapping, a unique *Other Details* section representing dynamic scraped dictionary components, and lastly an **Token Usage Table** detailing precisely how many AI tokens were utilized executing the application step and precisely what the inferred `$cost` was.
2. **Resume**: Raw viewer for AI Tailored Resume artifacts created during application process.
3. **Cover Letter**: Raw viewer for AI Generated Cover Letters.
4. **Q&A**: A dynamic checklist renderer exposing required form question parameters alongside parsed options (highlights arrays) and selected text answers accompanied by `answerSource`.

*All views integrate deeply with Tauri application state for real-time reactivity utilizing desktop IPC event listeners specifically targeting `bot-log` output to trigger seamless refreshes.*
