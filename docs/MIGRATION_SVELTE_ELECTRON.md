# Detailed Migration Report: Svelte Tauri to Svelte Electron

This report provides a comprehensive, step-by-step guide for migrating the current SvelteKit-based Tauri application to an Electron-based application. It is designed for an AI coding agent or a developer to execute without ambiguity.

## 1. Overview of Current Architecture vs. Electron Target

**Current Tauri Architecture:**
- **Frontend:** SvelteKit running on a Vite dev server or statically built using `@sveltejs/adapter-static`.
- **Backend:** Rust (Tauri 2). Handles OS-level operations (File System) and spawns external processes (Bun/Python).
- **IPC:** Frontend uses `@tauri-apps/api/core` for `invoke` and `@tauri-apps/api/event` for `listen`.

**Target Electron Architecture:**
- **Frontend (Renderer Process):** Same SvelteKit frontend.
- **Backend (Main Process):** Node.js running `electron/main.ts`. Replaces all Rust logic.
- **IPC:** Frontend uses `window.electronAPI.invoke` and `window.electronAPI.on`, which are exposed securely via a Preload script (`electron/preload.ts`) using `contextBridge`.

---

## 2. Dependency Management (`package.json`)

**Remove Tauri Dependencies:**
Remove the following from `dependencies` and `devDependencies`:
- `@tauri-apps/api`
- `@tauri-apps/plugin-fs`
- `@tauri-apps/plugin-opener`
- `@tauri-apps/plugin-shell`
- `@tauri-apps/cli`

**Add Electron Dependencies:**
Install the following `devDependencies`:
- `electron`
- `electron-builder`
- `vite-plugin-electron` (Optional, but recommended to wire Vite and Electron together)
- `concurrently` (To run Vite and Electron simultaneously in dev mode)

**Update Scripts:**
```json
"scripts": {
  "dev": "vite dev",
  "electron:dev": "concurrently \"vite dev\" \"electron .\"",
  "electron:build": "vite build && electron-builder"
}
```

---

## 3. Creating the Electron Architecture (New Files)

### 3.1 `electron/main.ts` (The Main Process)
This file replaces `src-tauri/src/main.rs`.
- Initializes `BrowserWindow`.
- In development, loads `http://localhost:5173`.
- In production, loads `index.html` from the Vite build output folder.
- Registers all `ipcMain.handle` and `ipcMain.on` channels corresponding to the Rust backend commands.

### 3.2 `electron/preload.ts` (The IPC Bridge)
This script runs before the renderer loads and exposes the API securely.
```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, data: any) => ipcRenderer.invoke(channel, data),
  on: (channel: string, func: (...args: any[]) => void) => {
    const subscription = (event: any, ...args: any[]) => func(...args);
    ipcRenderer.on(channel, subscription);
    return () => { ipcRenderer.removeListener(channel, subscription); };
  }
});
```

### 3.3 `electron-builder.json` (Packaging Configuration)
Replaces `tauri.conf.json`. Define `appId`, `productName`, and `directories` (output and build resources).

---

## 4. Frontend Refactoring

### 4.1 Create `src/lib/api-bridge.ts`
To minimize changes across the entire app, create an adapter that acts like Tauri's API but uses Electron's.
```typescript
// src/lib/api-bridge.ts
export async function invoke<T>(command: string, args: any = {}): Promise<T> {
  if (window && window.electronAPI) {
    return window.electronAPI.invoke(command, args);
  }
  console.warn(`[api-bridge] electronAPI not found. Mocking invoke: ${command}`);
  return Promise.resolve({} as T);
}

export async function listen(event: string, callback: (eventData: any) => void): Promise<() => void> {
  if (window && window.electronAPI) {
    return window.electronAPI.on(event, callback);
  }
  console.warn(`[api-bridge] electronAPI not found. Mocking listen: ${event}`);
  return Promise.resolve(() => {});
}
```

### 4.2 Replace Imports (Exact Files to Modify)
You MUST search for all instances of `@tauri-apps/api/core` and `@tauri-apps/api/event` and replace them with imports to the newly created bridge (`$lib/api-bridge.ts`). 

Here is the exact list of files that require modification:

**Svelte Components & Pages:**
1. `src/routes/testfunctions/+page.svelte` (L2)
2. `src/routes/run-bots/+page.svelte` (L2)
3. `src/routes/form-test/+page.svelte` (L3)
4. `src/routes/frontend-form/+page.svelte` (L3)
5. `src/routes/cover-letters/+page.svelte` (L6)
6. `src/routes/resume-enhancement/+page.svelte` (L5)
7. `src/lib/components/JobTrackerBase.svelte` (L10 `invoke`, L129 dynamic `listen` import)

**TypeScript / JavaScript Libs:**
8. `src/lib/authService.js` (L4)
9. `src/lib/corpus-rag-auth.js` (L34 dynamic `invoke` import)
10. `src/lib/stores/botProgressStore.ts` (L131 dynamic `invoke` import, L265 dynamic `listen` import)
11. `src/lib/file-manager.ts` (L1)

**Tests / Mocks:**
12. `src/tests/form-integration.test.ts` (L10 `vi.mock`)
13. `src/test-setup.ts` (L6 `vi.mock`)
14. `src/lib/file-manager.test.ts` (L11 `vi.mock`)

*Instruction for Agent: For dynamic imports (e.g., `await import('@tauri-apps/api/core')`), change them to `await import('$lib/api-bridge')`.*

---

## 5. Backend Logic Migration (Rust to Node.js IPC Handlers)

The Rust backend in `src-tauri/src/lib.rs` registers exactly 31 `#[tauri::command]` functions. You MUST create an equivalent `ipcMain.handle(channel, async (event, args) => { ... })` in `electron/ipc-handlers.ts` for each of them.

### 5.1 Basic File IO Commands
Map these using Node's `fs/promises` and `path` modules.
1. **`write_file_async`** `(filename, content)` -> `fs.writeFile`
2. **`read_file_async`** `(filename)` -> `fs.readFile`
3. **`copy_file_async`** `(source, destination)` -> `fs.copyFile`
4. **`rename_file_async`** `(old_name, new_name)` -> `fs.rename`
5. **`delete_file_async`** `(filename)` -> `fs.unlink`
6. **`create_directory_async`** `(dirname)` -> `fs.mkdir(..., { recursive: true })`
7. **`remove_directory_async`** `(dirname)` -> `fs.rm(..., { recursive: true, force: true })`
8. **`file_exists_async`** `(filename)` -> Use `fs.access` to return `true`/`false`.
9. **`get_file_metadata_async`** `(filename)` -> `fs.stat(filename)` and format as string output just like the Rust version does.

### 5.2 Bot Execution Commands
These handle the core "Bot" execution logic. You must use `import { spawn } from 'child_process'`.
10. **`run_bot_streaming`** `(bot_id, bot_name, extract_limit)`
    - *Agent Detail:* Spawn `bun src/bots/bot_starter.ts <bot_name>`. Set environment variables `BOT_ID` and `BOT_EXTRACT_LIMIT`. Attach to `stdout` and send via `event.sender.send('bot-log', { line, botId })`. Track the PID in a Map.
11. **`run_bot_for_job`** `(bot_name, job_url, job_id, mode, keep_open)`
    - *Agent Detail:* Spawn `bun src/bots/bot_starter.ts <bot_name> --url=<job_url> --mode=<mode>`. Send `bot-log` and `bot-stopped` events.
12. **`run_bot_bulk`** `(job_ids, mode, superbot)`
    - *Agent Detail:* Spawn `bun src/bots/bot_starter.ts bulk --jobs=<ids> --mode=<mode> --superbot=<superbot>`.
13. **`stop_bot`** `(bot_id)`
    - *Agent Detail:* Look up the PID from your Map. Since Bun spawns child processes (Playwright browsers), you MUST use a package like `tree-kill` (`npm i tree-kill`) to ensure the browser processes are also terminated.

### 5.3 Script Execution
14. **`run_python_script`** `(script_path)` -> Use `child_process.exec('python3 ...')`.
15. **`run_javascript_script`** `(script_path, args)` -> Use `child_process.exec('bun ...')`.

### 5.4 Managed Files Subsystem (The core local storage system)
This system stores users' resumes and covers locally. You must use `app.getPath('userData')` instead of the Rust `get_app_data_root()` logic.
16. **`register_managed_file`** `({ input: { userId, feature, filename, content, ... } })`
    - *Agent Detail:* Save the file content to `userData/users/<userId>/resumes/<filename>`. Update `userData/users/<userId>/index/files-index.json`.
17. **`register_managed_file_base64`** `({ input: { userId, feature, filename, contentBase64, ... } })`
    - *Agent Detail:* Convert base64 to buffer and save to disk.
18. **`get_managed_files_quota`** `({ userId })` -> Parse the `files-index.json` and return byte usage.
19. **`rebuild_managed_files_index`** `({ userId })` -> Scan directory and recreate `files-index.json`.
20. **`get_managed_files`** `({ query: { userId, feature, search, jobId } })` -> Read index and filter array.
21. **`preview_managed_file`** `({ query: { userId, fileId, maxChars } })`
    - *Agent Detail (PDFs):* In Rust, it uses `pdf_extract` crate. In Electron, you MUST install and use `pdf-parse` (`npm i pdf-parse`) to extract text from PDFs. For docx, return "[Binary file]".
22. **`delete_managed_files`** `({ input: { userId, fileIds } })` -> Remove files from disk and index.
23. **`move_managed_files`** `({ input: { userId, fileIds, targetFeature, targetJobId } })` -> Rename files and update index.
24. **`open_managed_file`** `({ input: { userId, fileId } })` -> Use Electron's `shell.openPath(fullPath)`.
25. **`get_managed_file_path`** `({ input: { userId, fileId } })` -> Return the full absolute path.
26. **`save_managed_file_to_downloads`** `({ input: { userId, fileId } })` -> Copy the file to `app.getPath('downloads')`.
27. **`open_file_path`** `(path)` -> `shell.openPath(path)`.
28. **`open_managed_file_parent`** `({ input: { userId, fileId } })` -> Use `shell.showItemInFolder(fullPath)`.
29. **`export_managed_files_backup`** `({ input: { userId } })` -> Create a zip/tar of the user's directory. (Requires a module like `archiver`).
30. **`import_managed_files_backup`** `({ input: { userId, backupPath } })` -> Extract a zip/tar. (Requires a module like `extract-zip`).

### 5.5 System
31. **`greet`** `(name)` -> Simple return `Hello, ${name}`.

---

## 6. Step-by-Step Implementation Roadmap for the Agent

1. **Scaffold Electron**: Initialize the `electron` directory. Add `electron`, `electron-builder`, `concurrently`, `tree-kill`, and `pdf-parse` to `package.json`. Create `electron/main.ts` and `electron/preload.ts`. Add them to `tsconfig.json`.
2. **Update Package Scripts**: Set up `"electron:dev": "concurrently \"vite dev\" \"electron .\""`. Validate the window opens.
3. **Bridge Implementation (Section 4)**: Create `src/lib/api-bridge.ts`. Execute a targeted find-and-replace on the exact 14 files listed in Section 4.2. Run Vite (`npm run dev:plain`) to ensure no Svelte compilation errors occur.
4. **Implement IPC Phase 1 - Basic IO & System (Section 5.1 & 5.3 & 5.5)**: Wire up the `ipcMain.handle` block in `electron/ipc-handlers.ts`. Write comprehensive switch/case or individual handles.
5. **Implement IPC Phase 2 - Bots (Section 5.2)**: 
    - Create a global `const RUNNING_BOTS = new Map<string, number>();`.
    - Implement `spawn` logic. 
    - CRITICAL: Route `stdout` using `event.sender.send('bot-log', { line, botId })` so the frontend logs update in real-time.
    - CRITICAL: Implement `stop_bot` using `tree-kill` on the stored PID.
6. **Implement IPC Phase 3 - Managed Files (Section 5.4)**: 
    - This requires building an internal JSON DB for resumes. 
    - Create utility functions `get_user_root(userId)` that uses `app.getPath('userData')`.
    - Implement the PDF parsing using `pdf-parse`.
7. **Clean Up**: Once Electron handles all `invoke` events successfully, delete the `src-tauri` directory. Delete `tauri.conf.json`.
8. **Configure Build**: Finalize `electron-builder.json`. Run `npm run electron:build` and test the final packaged executable.

---

## 7. Crucial Nuances and "Gotchas" for the Coding Agent

Read these carefully before generating any IPC handlers:

- **JSON Payload Differences (The `invoke` wrapper):** Tauri commands expect arguments wrapped in an object based on Rust parameter names. For example, `register_managed_file(input: RegisterManagedFileInput)` expects `invoke('register_managed_file', { input: { userId: '123', ... } })`. When you write your `ipcMain.handle('register_managed_file', (event, args) => ...)` in Node.js, `args` will literally be `{ input: { userId: '123', ... } }`. **Do NOT destructure `args` blindly; match the nested object structure exactly as sent by the frontend.**
- **Event Listeners (The `listen` wrapper):** The Rust `Emitter` sends payloads in a specific shape. In `botProgressStore.ts`, the frontend accesses `event.payload`. When sending events from the Main process, you MUST wrap the data so the frontend doesn't break: `event.sender.send('bot-log', { payload: { line, botId } })`.
- **Bot Process Zombies:** The Rust implementation tracks spawned PIDs. In Node.js, use `child.pid`. When stopping the bot (`stop_bot`), Bun spawns nested child processes (Playwright browser instances). A simple `process.kill(-pid)` might leave zombie Chrome windows open. You MUST use a module like `tree-kill` to recursively terminate the entire process tree.
- **Security Context:** Do not disable `contextIsolation`. Always use the `preload.ts` script to strictly control what the frontend can execute.
- **Dynamic Imports:** The frontend uses `await import('@tauri-apps/api/core')` in several files. Ensure you replace these with `await import('$lib/api-bridge')` (or a relative path to your adapter) instead of breaking the dynamic import pattern.
