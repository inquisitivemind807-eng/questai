<script>
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { botProgressStore } from "$lib/stores/botProgressStore";

  let bots = [
    { name: "seek_extract_bot", description: "Extract jobs from Seek.com.au using keywords, location, and filters (no apply)", image: "/seek-logo.png" },
    { name: "seek_apply_bot", description: "Apply to a single Seek job URL with Quick Apply flow", image: "/seek-logo.png" },
    { name: "linkedin_extract_bot", description: "Extract jobs from LinkedIn using keywords, location, and filters (no apply)", image: "/linkedin-logo.png" },
    { name: "linkedin_apply_bot", description: "Apply to a single LinkedIn job URL with Easy Apply flow", image: "/linkedin-logo.png" },
    { name: "indeed_bot", description: "Automate job searching on Indeed with Camoufox stealth browser and smart application features", image: "/indeed-logo.png" },
  ];

  $: platformFilter = $page.url.searchParams.get("platform") || "";

  $: filteredBots =
    platformFilter === "linkedin"
      ? bots.filter((b) => b.name === "linkedin_extract_bot" || b.name === "linkedin_apply_bot")
      : platformFilter === "seek"
        ? bots.filter((b) => b.name === "seek_extract_bot" || b.name === "seek_apply_bot")
        : platformFilter === "indeed"
          ? bots.filter((b) => b.name === "indeed_bot")
          : bots;

  let selectedPlatformFolder = "";

  const PLATFORM_FOLDER_LABELS = {
    linkedin: "LinkedIn Bot",
    seek: "Seek Bot",
    indeed: "Indeed Bot",
  };

  function getPlatformForBotName(name) {
    if (name.startsWith("linkedin_") || name === "linkedin_bot") return "linkedin";
    if (name.startsWith("seek_") || name === "seek_bot") return "seek";
    if (name === "indeed_bot" || name.startsWith("indeed_")) return "indeed";
    return "";
  }

  $: platformScopedBots =
    selectedPlatformFolder === ""
      ? filteredBots
      : filteredBots.filter((b) => getPlatformForBotName(b.name) === selectedPlatformFolder);

  let showConfigError = false;
  let extractCount = 10;
  let showConfigForBot = null;

  onMount(async () => {
    try {
      const availableBots = await invoke("get_available_bots");
      if (availableBots && availableBots.length > 0) {
        bots = availableBots.map((botName) => ({
          name: `${botName}_bot`,
          description: `Automate job searching on ${botName}`,
          image: `/${botName}-logo.png`,
        }));
      }
    } catch {
      // Keep static bot list as fallback
    }
  });

  function handleBotClick(botName) {
    if (
      botName === "seek_extract_bot" || botName === "seek_bot" ||
      botName === "linkedin_extract_bot" || botName === "linkedin_bot"
    ) {
      showConfigForBot = showConfigForBot === botName ? null : botName;
    } else {
      runBot(botName);
    }
  }

  async function runBot(botName) {
    try {
      try {
        await invoke("read_file_async", { filename: "src/bots/user-bots-config.json" });
      } catch {
        showConfigError = true;
        return;
      }

      const cleanBotName = botName.replace("_bot", "");
      const resolvedBotName = cleanBotName === "seek" ? "seek_extract" : cleanBotName;

      const params = /** @type {any} */ ({ botName: resolvedBotName });
      let limit = 0;
      if (resolvedBotName === "seek_extract" || resolvedBotName === "linkedin_extract") {
        limit = Number(extractCount) || 10;
        params.extractLimit = limit;
        params.extract_limit = limit;
        showConfigForBot = null;
      }

      const activeBotId = `bot_${Date.now()}`;
      botProgressStore.startBot(activeBotId, resolvedBotName, limit);

      invoke("run_bot_streaming", params).catch(err => {
        console.error("run_bot_streaming error:", err);
      });

      await goto("/bot-logs");
    } catch (error) {
      console.error(`Error starting ${botName}:`, error);
      alert(`Failed to start bot: ${error}`);
    }
  }

  function goToConfig() {
    showConfigError = false;
    goto("/frontend-form");
  }
</script>

<div class="container mx-auto p-8">
  <h1 class="text-4xl font-bold text-center mb-8">Choose a Bot</h1>

  <!-- Platform Folders -->
  {#if !selectedPlatformFolder}
    <div class="max-w-4xl mx-auto mb-10">
      <h2 class="text-2xl font-semibold text-center mb-4">
        Choose a platform to see its bots
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <button
          type="button"
          class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer"
          on:click={() => (selectedPlatformFolder = "linkedin")}
        >
          <div class="card-body items-center text-center">
            <div class="avatar mb-3">
              <div class="w-16 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                <img src="/linkedin-logo.png" alt="LinkedIn Bot" />
              </div>
            </div>
            <h3 class="card-title text-primary text-lg">LinkedIn Bot</h3>
            <p class="text-sm text-base-content/70">Open LinkedIn extract and apply bots.</p>
          </div>
        </button>

        <button
          type="button"
          class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer"
          on:click={() => (selectedPlatformFolder = "seek")}
        >
          <div class="card-body items-center text-center">
            <div class="avatar mb-3">
              <div class="w-16 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                <img src="/seek-logo.png" alt="Seek Bot" />
              </div>
            </div>
            <h3 class="card-title text-primary text-lg">Seek Bot</h3>
            <p class="text-sm text-base-content/70">Open Seek extract and apply bots.</p>
          </div>
        </button>

        <button
          type="button"
          class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer"
          on:click={() => (selectedPlatformFolder = "indeed")}
        >
          <div class="card-body items-center text-center">
            <div class="avatar mb-3">
              <div class="w-16 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                <img src="/indeed-logo.png" alt="Indeed Bot" />
              </div>
            </div>
            <h3 class="card-title text-primary text-lg">Indeed Bot</h3>
            <p class="text-sm text-base-content/70">Open the Indeed automation bot.</p>
          </div>
        </button>
      </div>
    </div>
  {/if}

  <!-- Bot Selection Cards -->
  {#if selectedPlatformFolder}
    <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
      <div class="breadcrumbs text-sm">
        <ul>
          <li>
            <button type="button" class="link link-hover" on:click={() => (selectedPlatformFolder = "")}>
              All Platforms
            </button>
          </li>
          <li>
            <span class="font-semibold">{PLATFORM_FOLDER_LABELS[selectedPlatformFolder] || "Bots"}</span>
          </li>
        </ul>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" on:click={() => (selectedPlatformFolder = "")}>
        Change platform
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
      {#each platformScopedBots as bot}
        <div
          class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer"
        >
          <figure class="px-10 pt-10">
            <div class="avatar">
              <div class="w-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                <img src={bot.image} alt={bot.name} />
              </div>
            </div>
          </figure>
          <div class="card-body items-center text-center">
            <h2 class="card-title text-primary text-lg">{bot.name}</h2>
            <p class="text-sm">{bot.description}</p>

            <div class="card-actions w-full mt-4 flex-col">
              {#if showConfigForBot === bot.name}
                <div class="w-full mb-4 form-control opacity-100 transition-opacity">
                  <label class="label p-1" for={`extract-count-${bot.name}`}>
                    <span class="label-text text-xs">Jobs to Extract:</span>
                  </label>
                  <input
                    id={`extract-count-${bot.name}`}
                    type="number"
                    min="1"
                    max="1000"
                    class="input input-bordered input-sm w-full"
                    bind:value={extractCount}
                  />
                  <button class="btn btn-success btn-sm w-full mt-2" on:click={() => runBot(bot.name)}>
                    Go
                  </button>
                  <button class="btn btn-ghost btn-xs w-full mt-1" on:click={() => (showConfigForBot = null)}>
                    Cancel
                  </button>
                </div>
              {:else}
                <button class="btn btn-primary btn-sm w-full" on:click={() => handleBotClick(bot.name)}>
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {bot.name === "seek_extract_bot" || bot.name === "seek_bot" ||
                   bot.name === "linkedin_extract_bot" || bot.name === "linkedin_bot"
                    ? "Configure & Start"
                    : "Start Bot"}
                </button>
              {/if}
            </div>
          </div>
        </div>
      {/each}

      {#if platformScopedBots.length === 0}
        <div class="col-span-full text-center text-base-content/60">
          No bots available for this platform.
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Config Missing Error Modal -->
{#if showConfigError}
  <div class="modal modal-open">
    <div class="modal-box bg-error text-error-content">
      <h3 class="font-bold text-lg mb-4">Configuration Required</h3>
      <p class="mb-4">You need to create your bot configuration before running any bots.</p>
      <p class="mb-6">Please go to the <strong>Configuration</strong> page and set up your:</p>
      <ul class="list-disc list-inside mb-6 space-y-1">
        <li>Job search keywords (e.g., "Java developer", "Data Analyst")</li>
        <li>Preferred location (e.g., "Sydney", "Remote")</li>
        <li>Other preferences (optional)</li>
      </ul>
      <div class="modal-action">
        <button class="btn btn-primary" on:click={goToConfig}>Go to Configuration Page</button>
        <button class="btn btn-ghost" on:click={() => (showConfigError = false)}>Cancel</button>
      </div>
    </div>
    <button type="button" class="modal-backdrop" aria-label="Close" on:click={() => (showConfigError = false)}></button>
  </div>
{/if}
