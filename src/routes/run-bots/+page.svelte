<script>
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { botProgressStore } from "$lib/stores/botProgressStore";
  import { profileService } from "$lib/services/profileService";

  let bots = [
    { id: "linkedin_extract_bot", name: "LinkedIn Bot", image: "/finallinkedin.png" },
    { id: "seek_extract_bot", name: "Seek Bot", image: "/finalseek.png" },
    { id: "indeed_bot", name: "Indeed Bot", image: "/finalindeed.png" },
  ];

  let showConfigError = false;
  let extractCount = 10;
  
  let profiles = [];
  let selectedProfileId = "";
  let isLoadingProfiles = true;

  onMount(async () => {
    try {
      const allProfiles = await profileService.getProfiles();
      profiles = allProfiles.filter(p => p.isActive);
      const activeProfile = profiles.find(p => p.isSelected);
      if (activeProfile) {
        selectedProfileId = activeProfile._id;
      }
    } catch (err) {
      console.error("Failed to load profiles:", err);
    } finally {
      isLoadingProfiles = false;
    }
  });

  async function handleProfileSelectChange() {
    if (selectedProfileId) {
      try {
        await profileService.updateProfile(selectedProfileId, { isSelected: true });
      } catch (err) {
        console.error("Failed to set selected profile globally:", err);
      }
    }
  }

  function handleBotClick(botId) {
    runBot(botId);
  }

  async function runBot(botId) {
    try {
      let configContent = "{}";
      try {
        configContent = await invoke("read_file_async", { filename: "src/bots/user-bots-config.json" });
      } catch {
        showConfigError = true;
        return;
      }

      // Profile Injection
      if (selectedProfileId) {
        const profile = profiles.find(p => p._id === selectedProfileId);
        if (profile) {
          try {
            const config = JSON.parse(configContent);
            if (!config.formData) config.formData = {};
            
            if (profile.keywords && profile.keywords.length > 0) {
              config.formData.keywords = profile.keywords.join(", ");
            }
            if (profile.resume && profile.resume.filename) {
              config.formData.resumeFileName = profile.resume.filename;
            }
            if (profile.locations && profile.locations.length > 0) {
              config.formData.locations = profile.locations.join(", ");
            }
            if (profile.excludedCompanies && profile.excludedCompanies.length > 0) {
              config.formData.excludedCompanies = profile.excludedCompanies.join(", ");
            }
            if (profile.excludedKeywords && profile.excludedKeywords.length > 0) {
              config.formData.excludedKeywords = profile.excludedKeywords.join(", ");
            }
            if (profile.jobType) config.formData.jobType = profile.jobType;
            if (profile.experienceLevel) config.formData.experienceLevel = profile.experienceLevel;
            if (profile.remotePreference) config.formData.remotePreference = profile.remotePreference;
            if (profile.industry) config.formData.industry = profile.industry;
            if (profile.listedDate) config.formData.listedDate = profile.listedDate;
            if (profile.minSalary) config.formData.minSalary = profile.minSalary;
            if (profile.maxSalary) config.formData.maxSalary = profile.maxSalary;
            if (profile.rewriteResume !== undefined) config.formData.rewriteResume = profile.rewriteResume;
            if (profile.botMode) config.formData.botMode = profile.botMode;

            config.formData.activeProfileId = profile._id;
            config.formData.profileBasicInfo = profile.questions?.basicInfo || [];
            config.formData.profileSpecificQA = profile.questions?.profileSpecific || [];

            await invoke("write_file_async", { filename: "src/bots/user-bots-config.json", content: JSON.stringify(config, null, 2) });
          } catch (err) {
            console.error("Failed to inject profile into config:", err);
          }
        }
      }

      const cleanBotName = botId.replace("_bot", "");
      let finalBotName = cleanBotName === "seek" ? "seek_extract" : 
                         cleanBotName === "linkedin" ? "linkedin_extract" : 
                         cleanBotName;

      // Ensure we map to the correct internal bot names
      if (cleanBotName === "linkedin") finalBotName = "linkedin_extract";
      if (cleanBotName === "seek") finalBotName = "seek_extract";

      const params = /** @type {any} */ ({ botName: finalBotName });
      let limit = 10; // Default as requested
      
      if (finalBotName.includes("extract") || finalBotName === "indeed_bot") {
        params.extractLimit = limit;
        params.extract_limit = limit;
      }

      const activeBotId = `bot_${Date.now()}`;
      botProgressStore.startBot(activeBotId, finalBotName, limit);

      const runParams = {
        botId: activeBotId,
        botName: finalBotName,
        extractLimit: limit
      };

      invoke("run_bot_streaming", runParams).catch(err => {
        console.error("run_bot_streaming error:", err);
      });

      await goto("/bot-logs");
    } catch (error) {
      console.error(`Error starting ${botId}:`, error);
      alert(`Failed to start bot: ${error}`);
    }
  }

  function goToConfig() {
    showConfigError = false;
    goto("/frontend-form");
  }
</script>

<div class="container mx-auto p-8 min-h-[calc(100vh-80px)] flex flex-col">
  <div class="mb-10 max-w-5xl mx-auto w-full">
    <div class="bg-base-100 rounded-2xl p-6 border border-base-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
      <div class="flex items-center gap-4 w-full md:w-auto">
        <div class="bg-primary/10 p-3 rounded-xl text-primary flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div class="flex-grow">
          <h3 class="font-bold text-base text-base-content">Select Career Profile</h3>
          <p class="text-xs text-base-content/60">Choose a profile to automatically apply its targeted keywords and resume.</p>
        </div>
      </div>
      <div class="w-full md:w-72">
        {#if isLoadingProfiles}
          <div class="flex justify-center"><span class="loading loading-spinner loading-sm"></span></div>
        {:else if profiles.length > 0}
          <select bind:value={selectedProfileId} on:change={handleProfileSelectChange} class="select select-bordered w-full">
            <option value="">Default Config (Current settings)</option>
            {#each profiles as profile}
              <option value={profile._id}>{profile.profileName}</option>
            {/each}
          </select>
        {:else}
          <div class="text-sm text-base-content/60 italic">No profiles created yet.</div>
        {/if}
      </div>
    </div>
  </div>

  <div class="flex-grow">
    <div class="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
      {#each bots as bot}
        <button
          type="button"
          class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden group border border-base-200"
          on:click={() => handleBotClick(bot.id)}
        >
          <figure class="h-64 overflow-hidden relative">
            <img src={bot.image} alt={bot.name} class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
            <div class="absolute inset-0 bg-primary/5 group-hover:bg-transparent transition-colors duration-300"></div>
          </figure>
          
          <div class="card-body p-6 items-center text-center">
            <h2 class="card-title text-2xl font-bold text-primary">{bot.name}</h2>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <div class="mt-12 max-w-5xl mx-auto w-full">
    <div class="bg-base-200/50 rounded-2xl p-6 border border-base-300 flex flex-col md:flex-row items-center justify-between gap-6">
      <div class="flex items-center gap-4">
        <div class="bg-primary/10 p-3 rounded-xl text-primary">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          </svg>
        </div>
        <div>
          <h3 class="font-bold text-base text-base-content">Need to change keywords?</h3>
          <p class="text-xs text-base-content/60">Update your search criteria in the Configuration settings.</p>
        </div>
      </div>
      <button class="btn btn-outline btn-sm" on:click={goToConfig}>
        Configuration settings
      </button>
    </div>
  </div>
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
