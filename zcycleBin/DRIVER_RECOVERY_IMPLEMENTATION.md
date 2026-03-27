# Driver Recovery Implementation

## Problem
The bot was shutting down when the browser session became invalid, preventing continuous job processing.

## Solution
Implemented automatic driver recovery that recreates the driver instance when the session is lost, allowing the bot to continue working.

## Changes Made

### 1. Driver Recovery Function (`seek_impl.ts`)
- **Function**: `recreateDriverAndRestoreContext(ctx: WorkflowContext)`
- **Purpose**: Recreates the driver and restores all context when session is invalid
- **Features**:
  - Saves current URL before old driver is destroyed
  - Creates new driver instance using `setupChromeDriver`
  - Restores all context properties (overlay, sessionManager, humanBehavior)
  - Applies stealth features to new driver
  - Navigates back to saved URL or homepage
  - Re-registers recovery callback on new driver

### 2. Browser Monitoring Updates (`browser_manager.ts`)
- **Change**: Instead of shutting down on session errors, monitoring now attempts driver recovery
- **Behavior**:
  - Detects invalid session after 5 consecutive errors
  - Calls recovery callback if available
  - Only shuts down if browser was manually closed (0 windows)
  - Allows workflow to handle recovery if callback not available

### 3. Recovery Callback Registration
- **Location**: `openHomepage` and `recreateDriverAndRestoreContext`
- **Purpose**: Stores recovery function on driver object for monitoring to access
- **Implementation**: `(driver as any).__recoverDriver = async () => recreateDriverAndRestoreContext(ctx)`

### 4. Workflow Step Updates (`seek_impl.ts`)
- **Updated**: `closeQuickApplyAndContinueSearch`
- **Changes**:
  - All invalid session checks now attempt recovery instead of just yielding error
  - Recovery happens before closing tabs, after closing tabs, and when session is detected as invalid

## How It Works

1. **Detection**: Browser monitoring or workflow steps detect invalid session
2. **Recovery Attempt**: 
   - Save current URL
   - Clean up old driver
   - Create new driver instance
   - Restore context (overlay, sessionManager, etc.)
   - Navigate to saved URL
3. **Continuation**: Workflow continues with new driver instance

## Benefits

✅ **No More Premature Shutdowns**: Bot continues working even if session is lost
✅ **Automatic Recovery**: No manual intervention needed
✅ **State Preservation**: Attempts to navigate back to same page
✅ **Seamless Operation**: Workflow continues without interruption

## Testing

Run the bot and verify:
1. Bot starts normally
2. If session becomes invalid, recovery happens automatically
3. Bot continues processing jobs after recovery
4. No "session ID invalid" shutdowns

## Code Locations

- **Recovery Function**: `questai/src/bots/seek/seek_impl.ts` (lines 1887-1977)
- **Monitoring Updates**: `questai/src/bots/core/browser_manager.ts` (lines 177-234)
- **Callback Registration**: `questai/src/bots/seek/seek_impl.ts` (lines 354, 1942)
