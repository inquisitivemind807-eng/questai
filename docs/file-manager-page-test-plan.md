# File Manager Page Detailed Test Plan

## Scope
Validate `finalboss/src/routes/files/+page.svelte` end-to-end behavior for:
- listing and grouping
- search and filters
- selection and bulk operations
- preview/open/folder actions
- backup export/import
- user feedback and error handling

## Preconditions
- User is authenticated in FinalBoss desktop app.
- Local file manager index contains at least:
  - 1 `resume` file
  - 1 `cover-letter` file
  - 1 `enhancement` file
  - at least 2 different `jobId` values
- Files have mixed sizes:
  - small: `< 100 KB`
  - medium: `100 KB - 1 MB`
  - large: `>= 1 MB`

## Test Matrix

### 1) List and Grouping
- Open `Files` page from sidebar and dashboard card.
- Verify table renders grouped cards:
  - `Job Group: <jobId>` for each job
  - `Job Group: ungrouped` for files without job id.
- Verify columns display:
  - Name, Feature, Size, Updated, Actions.

Expected:
- Files are visible under correct groups.
- Group order and row rendering remain stable after refresh.

### 2) Search Filter
- In search box, type a unique filename fragment (e.g. `google`).
- Verify only matching rows remain.
- Clear search and verify all rows return.
- Search by job id fragment and source route fragment.

Expected:
- Filter is case-insensitive and updates immediately.

### 3) Feature Filter
- Select `resume`.
- Verify only resume files show.
- Repeat for `cover-letter`, `enhancement`, `other`.
- Reset to `All features`.

Expected:
- Only selected feature appears each time.
- No stale rows remain from previous filter.

### 4) Size Filter
- Select `Small (<100 KB)` and verify only small files.
- Select `Medium (100 KB - 1 MB)` and verify only medium files.
- Select `Large (>=1 MB)` and verify only large files.
- Return to `All sizes`.

Expected:
- Boundary behavior is correct for threshold values.

### 5) Selection and Bulk Delete
- Click `Toggle Select Visible`.
- Verify selected count badge equals visible rows.
- Click `Bulk Delete`.
- Confirm prompt.

Expected:
- Deletion succeeds.
- Success message appears with deleted count.
- List refreshes and removed rows disappear.
- Selected count resets to 0.

### 6) Selection and Bulk Move
- Select multiple rows.
- Set move target feature (e.g. `enhancement`).
- Enter target `jobId` (e.g. `job-99`) and click `Bulk Move`.

Expected:
- Success message appears with moved count.
- Rows reappear under new group/feature after refresh.
- Existing metadata remains intact (filename, size).

### 7) Preview / Open / Folder Actions
- Click `Preview` for a file.
- Verify preview panel appears and filename/title matches.
- Click `Open` for same row.
- Click `Folder` for same row.

Expected:
- Preview text appears or safe fallback message.
- OS opens file for `Open`.
- OS opens containing directory for `Folder`.

### 8) Backup Export / Import
- Click `Export Backup`; copy resulting path.
- Verify success message includes backup path.
- Paste path in import input and click `Import Backup`.

Expected:
- Import result count appears.
- File list refreshes and includes imported entries (deduplicated).

### 9) Error and Empty States
- Force API failure (mock or temporary command failure).
- Verify error banner appears.
- Apply filters that return zero results.

Expected:
- Friendly error shown; app does not crash.
- Empty-state message: `No files found for the current filters.`

## Regression Checks
- Sidebar navigation still works for existing routes.
- Dashboard still renders all previous cards.
- Cover letter and resume enhancement pages can still generate content and save local entries.
- Frontend form resume upload still works.

## Automation Coverage
Automated tests are implemented in:
- `src/tests/files-manager-page.test.ts`
- `src/lib/file-manager-utils.test.ts`
- `src/lib/file-manager.test.ts`

These cover:
- filter logic
- grouping logic
- page interactions
- bulk operations
- preview/open/folder
- import/export invocation
