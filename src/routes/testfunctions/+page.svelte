<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";

    let name = $state("");
    let greetMsg = $state("");

    let output = $state<string[]>([]);

    // File operations test variables
    let filename = $state("");
    let fileContent = $state("");
    let writeResult = $state("");
    let readResult = $state("");
    let sourceFile = $state("");
    let destinationFile = $state("");
    let copyResult = $state("");
    let oldName = $state("");
    let newName = $state("");
    let renameResult = $state("");
    let deleteFile = $state("");
    let deleteResult = $state("");
    let dirName = $state("");
    let dirResult = $state("");
    let metadataFile = $state("");
    let metadataResult = $state("");
    let existsFile = $state("");
    let existsResult = $state("");

    async function greet(event: Event) {
        event.preventDefault();
        greetMsg = await invoke("greet", { name });
    }

    async function readDirectory(path: string) {
        output = await invoke<string[]>("list_files", { path });
    }

    async function writeFile(event: Event) {
        event.preventDefault();
        try {
            writeResult = await invoke<string>("write_file_async", {
                filename: filename,
                content: fileContent,
            });
        } catch (error) {
            writeResult = `Error: ${error}`;
        }
    }

    async function readFile(event: Event) {
        event.preventDefault();
        try {
            readResult = await invoke<string>("read_file_async", {
                filename: filename,
            });
        } catch (error) {
            readResult = `Error: ${error}`;
        }
    }

    async function copyFile(event: Event) {
        event.preventDefault();
        try {
            copyResult = await invoke<string>("copy_file_async", {
                source: sourceFile,
                destination: destinationFile,
            });
        } catch (error) {
            copyResult = `Error: ${error}`;
        }
    }

    async function renameFile(event: Event) {
        event.preventDefault();
        try {
            renameResult = await invoke<string>("rename_file_async", {
                oldName: oldName,
                newName: newName,
            });
        } catch (error) {
            renameResult = `Error: ${error}`;
        }
    }

    async function deleteFileFunc(event: Event) {
        event.preventDefault();
        try {
            deleteResult = await invoke<string>("delete_file_async", {
                filename: deleteFile,
            });
        } catch (error) {
            deleteResult = `Error: ${error}`;
        }
    }

    async function createDirectory(event: Event) {
        event.preventDefault();
        try {
            dirResult = await invoke<string>("create_directory_async", {
                dirname: dirName,
            });
        } catch (error) {
            dirResult = `Error: ${error}`;
        }
    }

    async function getMetadata(event: Event) {
        event.preventDefault();
        try {
            metadataResult = await invoke<string>("get_file_metadata_async", {
                filename: metadataFile,
            });
        } catch (error) {
            metadataResult = `Error: ${error}`;
        }
    }

    async function checkExists(event: Event) {
        event.preventDefault();
        try {
            const exists = await invoke<boolean>("file_exists_async", {
                filename: existsFile,
            });
            existsResult = `File ${existsFile} ${exists ? "EXISTS" : "DOES NOT EXIST"}`;
        } catch (error) {
            existsResult = `Error: ${error}`;
        }
    }
</script>

<div class="container mx-auto p-8">
    <h1 class="text-4xl font-bold text-center mb-8">🧪 Test Functions</h1>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Greet Function Test -->
        <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <h2 class="card-title">🤖 Greet Function</h2>
                <form class="space-y-4" onsubmit={greet}>
                    <div class="form-control">
                        <input
                            id="greet-input"
                            type="text"
                            placeholder="Enter your name"
                            bind:value={name}
                            class="input input-bordered"
                        />
                    </div>
                    <button type="submit" class="btn btn-primary">Greet</button>
                </form>
                <div class="mockup-code mt-4">
                    <pre><code>{greetMsg || "No greeting yet..."}</code></pre>
                </div>
            </div>
        </div>

        <!-- Directory Reader Test -->
        <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <h2 class="card-title">📂 Directory Reader</h2>
                <button
                    class="btn btn-primary"
                    onclick={() => readDirectory("/home/wagle/finalboss")}
                    >Read Directory</button
                >
                <div class="mt-4 max-h-60 overflow-y-auto">
                    {#if output.length > 0}
                        {#each output as item}
                            <div class="alert alert-info mb-2">{item}</div>
                        {/each}
                    {:else}
                        <div
                            class="text-center text-base-content/70 italic py-8"
                        >
                            No directory contents to display
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        <!-- File Writer Test -->
        <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <h2 class="card-title">📝 File Writer</h2>
                <form class="space-y-4" onsubmit={writeFile}>
                    <div class="form-control">
                        <input
                            type="text"
                            placeholder="Enter filename (e.g., test.txt)"
                            bind:value={filename}
                            class="input input-bordered"
                        />
                    </div>
                    <div class="form-control">
                        <textarea
                            placeholder="Enter file content..."
                            bind:value={fileContent}
                            class="textarea textarea-bordered h-32"
                        ></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary"
                        >Write File</button
                    >
                </form>
                <div class="mockup-code mt-4">
                    <pre><code>{writeResult || "No file written yet..."}</code
                        ></pre>
                </div>
            </div>
        </div>

        <!-- File Reader Test -->
        <div class="test-card">
            <h2 class="card-title">📖 File Reader</h2>
            <form class="form-column" onsubmit={readFile}>
                <input
                    type="text"
                    placeholder="Enter filename to read"
                    bind:value={filename}
                />
                <button type="submit">Read File</button>
            </form>
            <div class="result-box">
                {readResult || "No file read yet..."}
            </div>
        </div>

        <!-- File Copy Test -->
        <div class="test-card">
            <h2 class="card-title">📋 File Copier</h2>
            <form class="form-column" onsubmit={copyFile}>
                <input
                    type="text"
                    placeholder="Source file path"
                    bind:value={sourceFile}
                />
                <input
                    type="text"
                    placeholder="Destination file path"
                    bind:value={destinationFile}
                />
                <button type="submit">Copy File</button>
            </form>
            <div class="result-box">
                {copyResult || "No file copied yet..."}
            </div>
        </div>

        <!-- File Rename Test -->
        <div class="test-card">
            <h2 class="card-title">🔄 File Renamer</h2>
            <form class="form-column" onsubmit={renameFile}>
                <input
                    type="text"
                    placeholder="Current filename"
                    bind:value={oldName}
                />
                <input
                    type="text"
                    placeholder="New filename"
                    bind:value={newName}
                />
                <button type="submit">Rename File</button>
            </form>
            <div class="result-box">
                {renameResult || "No file renamed yet..."}
            </div>
        </div>

        <!-- File Delete Test -->
        <div class="test-card">
            <h2 class="card-title">🗑️ File Deleter</h2>
            <form class="form-column" onsubmit={deleteFileFunc}>
                <input
                    type="text"
                    placeholder="File to delete"
                    bind:value={deleteFile}
                />
                <button
                    type="submit"
                    style="background: linear-gradient(45deg, #ff0000, #ff6600);"
                    >Delete File</button
                >
            </form>
            <div class="result-box">
                {deleteResult || "No file deleted yet..."}
            </div>
        </div>

        <!-- Directory Creator Test -->
        <div class="test-card">
            <h2 class="card-title">📁 Directory Creator</h2>
            <form class="form-column" onsubmit={createDirectory}>
                <input
                    type="text"
                    placeholder="Directory path to create"
                    bind:value={dirName}
                />
                <button type="submit">Create Directory</button>
            </form>
            <div class="result-box">
                {dirResult || "No directory created yet..."}
            </div>
        </div>

        <!-- File Metadata Test -->
        <div class="test-card">
            <h2 class="card-title">📊 File Metadata</h2>
            <form class="form-column" onsubmit={getMetadata}>
                <input
                    type="text"
                    placeholder="File path for metadata"
                    bind:value={metadataFile}
                />
                <button type="submit">Get Metadata</button>
            </form>
            <div class="result-box">
                {metadataResult || "No metadata retrieved yet..."}
            </div>
        </div>

        <!-- File Exists Check -->
        <div class="test-card">
            <h2 class="card-title">🔍 File Exists Check</h2>
            <form class="form-column" onsubmit={checkExists}>
                <input
                    type="text"
                    placeholder="File path to check"
                    bind:value={existsFile}
                />
                <button type="submit">Check Exists</button>
            </form>
            <div class="result-box">
                {existsResult || "No existence check yet..."}
            </div>
        </div>
    </div>
</div>
