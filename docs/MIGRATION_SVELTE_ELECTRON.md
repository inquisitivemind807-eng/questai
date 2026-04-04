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
  if (window.electronAPI) {
    return window.electronAPI.invoke(command, args);
  }
  throw new Error('Electron API not found');
}

export async function listen(event: string, callback: (eventData: any) => void): Promise<() => void> {
  if (window.electronAPI) {
    // Note: Tauri wraps payloads differently than Electron. You may need to adapt the shape.
    return window.electronAPI.on(event, callback);
  }
  throw new Error('Electron API not found');
}
```

### 4.2 Replace Imports
Search for all instances of `@tauri-apps/api/core` and `@tauri-apps/api/event`.
Replace them with the newly created bridge.
**Key Files to Update:**
- `src/lib/file-manager.ts`
- `src/lib/stores/botProgressStore.ts`
- `src/lib/authService.js`
- `src/lib/corpus-rag-auth.js`
- Multiple `+page.svelte` files calling `invoke`.

---

## 5. Backend Logic Migration (Rust to Node.js)

The Rust backend in `src-tauri/src/lib.rs` registers 31 `#[tauri::command]` functions. All of these must be re-implemented in Node.js within `electron/ipc-handlers.ts` and registered in `main.ts` using `ipcMain.handle`.

### 5.1 Basic File IO Commands
Use Node's `fs/promises` (`fs`) and `path` modules.
- `write_file_async` -> `fs.writeFile`
- `read_file_async` -> `fs.readFile`
- `copy_file_async` -> `fs.copyFile`
- `rename_file_async` -> `fs.rename`
- `delete_file_async` -> `fs.unlink`
- `create_directory_async` -> `fs.mkdir(..., { recursive: true })`
- `remove_directory_async` -> `fs.rm(..., { recursive: true })`
- `file_exists_async` -> check with `fs.access`
- `get_file_metadata_async` -> `fs.stat`

### 5.2 Bot Execution Commands
These functions spawn external Bun/Python processes.
- `run_bot_streaming`, `run_bot_for_job`, `run_bot_bulk`
  - **Implementation**: Use `child_process.spawn('bun', [...args])`.
  - **State Tracking**: Replace `RUNNING_BOTS` Rust Mutex with a standard JS `Map<string, number>` tracking `botId` -> PID.
  - **Streaming Logs**: Attach listeners to `child.stdout.on('data', ...)` and use `mainWindow.webContents.send('bot-log', { line, botId })` to stream logs.
  - **Process Termination**: `stop_bot` -> Use `process.kill(-pid)` or `tree-kill` to terminate the spawned processes.

### 5.3 Script Execution
- `run_python_script` -> `child_process.exec('python3 ...')`
- `run_javascript_script` -> `child_process.exec('bun ...')`

### 5.4 Managed Files Subsystem
This is the most complex part of the Rust backend.
- `register_managed_file`, `register_managed_file_base64`, `get_managed_files`, `preview_managed_file`, etc.
- **Data Store**: In Rust, it updates `index/files-index.json`. In Node.js, read and write to this exact JSON file, ensuring you handle concurrency if needed (though JS is single-threaded, atomic file writes are recommended).
- **Paths**: Replicate `get_app_data_root()` logic using `app.getPath('userData')`.
- **PDF Extraction**: `preview_managed_file` uses a Rust crate to read PDF text. In Node.js, you will need a library like `pdf-parse` or `pdfjs-dist` to implement `pdf_extract`.

---

## 6. Step-by-Step Implementation Roadmap

1. **Scaffold Electron**: Initialize the `electron` directory, create `main.ts` and `preload.ts`. Add them to `tsconfig.json`.
2. **Update Package Scripts**: Set up `electron:dev` concurrently running Vite and Electron. Validate that the Electron window opens and loads the frontend.
3. **Bridge Implementation**: Create `src/lib/api-bridge.ts`. Do a global search and replace of Tauri imports with the bridge.
4. **Implement IPC - Phase 1 (File IO)**: Wire up the basic `fs` commands in `ipcMain`. Validate that the Svelte frontend can read/write files.
5. **Implement IPC - Phase 2 (Bot Running)**: Wire up `child_process.spawn`. Ensure that `stdout` properly emits to `mainWindow.webContents.send('bot-log', ...)`. Validate that the frontend UI receives the logs and updates.
6. **Implement IPC - Phase 3 (Managed Files)**: Rewrite the file indexer logic in Node.js. Use `app.getPath('userData')` to store the user-specific resumes. Implement PDF text extraction.
7. **Clean Up**: Once all features are functionally validated on Electron, delete the `src-tauri` directory and remove all Tauri dependencies from `package.json`.
8. **Configure Build**: Finalize `electron-builder.json`. Run `npm run electron:build` and test the packaged executable.

## 7. Crucial Nuances for the Coding Agent

- **JSON Payload Differences:** Tauri commands expect arguments wrapped in an object (e.g., `invoke('command', { input: { ... } })`). You must either replicate this strict shape in your IPC handlers, or modify the frontend to pass flat arguments.
- **Event Listeners:** The Rust `Emitter` sends payloads in a specific shape: `{ event, payload }`. In `botProgressStore.ts`, the frontend accesses `event.payload`. Ensure `webContents.send` sends the data wrapped properly so the frontend doesn't break.
- **Bot Process IDs:** The Rust implementation tracks spawned PIDs using `child.id()`. In Node.js, use `child.pid`. When stopping the bot (`stop_bot`), remember that Bun might spawn child processes, so using a module like `tree-kill` might be necessary to ensure all zombie processes die.
- **Security Context:** Do not disable `contextIsolation`. Always use the `preload.ts` script to strictly control what the frontend can execute.
