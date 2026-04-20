<script lang="ts">
  import { onMount } from 'svelte';
  import { profileService } from '$lib/services/profileService';
  import { goto } from '$app/navigation';

  let profiles: any[] = [];
  let isLoading = true;
  let showModal = false;
  let newProfileName = '';
  let isSaving = false;
  let errorMsg = '';

  onMount(async () => {
    await fetchProfiles();
  });

  async function fetchProfiles() {
    isLoading = true;
    errorMsg = '';
    try {
      profiles = await profileService.getProfiles();
    } catch (err: any) {
      errorMsg = err.message || 'Failed to load profiles';
    } finally {
      isLoading = false;
    }
  }

  async function createProfile() {
    if (!newProfileName.trim()) return;
    
    isSaving = true;
    errorMsg = '';
    try {
      const newProfile = await profileService.createProfile(newProfileName);
      profiles = [newProfile, ...profiles];
      showModal = false;
      newProfileName = '';
    } catch (err: any) {
      errorMsg = err.message || 'Failed to create profile';
    } finally {
      isSaving = false;
    }
  }

  function handleProfileClick(id: string) {
    goto(`/profiles/${id}`);
  }

  async function toggleActive(profile: any) {
    const newStatus = !profile.isActive;
    profile.isActive = newStatus;
    profiles = profiles; // Trigger reactivity
    try {
      await profileService.updateProfile(profile._id, { isActive: newStatus });
    } catch (err: any) {
      // revert
      profile.isActive = !newStatus;
      profiles = profiles;
      errorMsg = err.message || 'Failed to toggle status';
    }
  }

  async function selectProfile(id: string) {
    const oldSelectedId = profiles.find(p => p.isSelected)?._id;
    if (oldSelectedId === id) return;

    profiles = profiles.map(p => ({ ...p, isSelected: p._id === id }));
    try {
      await profileService.updateProfile(id, { isSelected: true });
    } catch (err: any) {
      // revert
      profiles = profiles.map(p => ({ ...p, isSelected: p._id === oldSelectedId }));
      errorMsg = err.message || 'Failed to set active profile';
    }
  }
</script>

<svelte:head>
  <title>Profiles | Quest Bot</title>
</svelte:head>

<div class="p-6 max-w-7xl mx-auto space-y-6">
  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div>
      <h1 class="text-3xl font-bold text-base-content">My Profiles</h1>
      <p class="text-base-content/70 mt-1">Manage career tracks and job search personas</p>
    </div>
    <button class="btn btn-primary" on:click={() => { errorMsg=''; showModal = true; }}>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
      Add Profile
    </button>
  </div>

  {#if errorMsg && !showModal}
    <div class="alert alert-error">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      <span>{errorMsg}</span>
    </div>
  {/if}

  {#if isLoading}
    <div class="flex justify-center p-12">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
  {:else if profiles.length === 0}
    <div class="card bg-base-100 shadow-xl mt-8">
      <div class="card-body items-center text-center p-12">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-base-content/20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <h2 class="card-title text-2xl">No profiles found</h2>
        <p class="text-base-content/60 max-w-md mt-2">Create multiple profiles for different career tracks. The automated applied bots will use your selected profile context.</p>
        <div class="card-actions mt-6">
          <button class="btn btn-primary" on:click={() => { errorMsg=''; showModal = true; }}>Create First Profile</button>
        </div>
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each profiles as profile}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div 
          class="card bg-base-100 shadow-lg hover:shadow-xl transition-all {profile.isSelected ? 'border-primary ring-1 ring-primary' : 'border-base-200'} {!profile.isActive ? 'opacity-60 grayscale-[50%]' : ''} border relative"
        >
          <div class="card-body">
            <div class="flex justify-between items-start">
              <h2 class="card-title text-xl {profile.isActive ? 'text-primary' : 'text-base-content/50'} cursor-pointer hover:underline" on:click={() => handleProfileClick(profile._id)}>
                {profile.profileName}
                {#if profile.isSelected}
                  <div class="badge badge-primary badge-sm ml-2">Active</div>
                {/if}
              </h2>
              
              <div class="tooltip" data-tip={profile.isActive ? "Disable Profile" : "Enable Profile"}>
                <input type="checkbox" class="toggle toggle-sm {profile.isActive ? 'toggle-success' : ''}" checked={profile.isActive} on:change={() => toggleActive(profile)} />
              </div>
            </div>
            
            <div class="mt-4 space-y-2 cursor-pointer" on:click={() => handleProfileClick(profile._id)}>
              <div class="flex items-center gap-2 text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span class={profile.resume?.filename ? 'text-success' : 'text-base-content/50'}>
                  {profile.resume?.filename ? 'Resume Uploaded' : 'No Resume'}
                </span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                <span>{profile.keywords?.length || 0} Keywords</span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{(profile.questions?.basicInfo?.length || 0) + (profile.questions?.profileSpecific?.length || 0)} Answers</span>
              </div>
            </div>
            
            <div class="card-actions justify-between mt-6 items-center">
              <button 
                 class="btn btn-sm {profile.isSelected ? 'btn-primary' : 'btn-outline border-base-300'}" 
                 disabled={!profile.isActive || profile.isSelected}
                 on:click={() => selectProfile(profile._id)}>
                 {profile.isSelected ? 'Selected' : 'Use this Profile'}
              </button>
              <button class="btn btn-sm btn-ghost text-primary hover:bg-base-200" on:click={() => handleProfileClick(profile._id)}>Edit &rarr;</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showModal}
<div class="modal modal-open">
  <div class="modal-box w-11/12 max-w-md">
    <h3 class="font-bold text-lg">Create New Profile</h3>
    <p class="py-2 text-sm text-base-content/70">What role are you targeting with this profile? (e.g. "Senior React Developer")</p>
    
    {#if errorMsg}
      <div class="alert alert-error text-sm mt-2 mb-4 p-2">
        <span>{errorMsg}</span>
      </div>
    {/if}
    
    <div class="form-control w-full mt-4">
      <label class="label"><span class="label-text">Profile Name</span></label>
      <input 
        type="text" 
        bind:value={newProfileName} 
        placeholder="AI Engineer" 
        class="input input-bordered w-full focus:input-primary"
        on:keyup={(e) => e.key === 'Enter' && createProfile()}
      />
    </div>
    
    <div class="modal-action">
      <button class="btn btn-ghost" on:click={() => showModal = false} disabled={isSaving}>Cancel</button>
      <button class="btn btn-primary" on:click={createProfile} disabled={isSaving || !newProfileName.trim()}>
        {#if isSaving}
          <span class="loading loading-spinner text-primary-content"></span>
        {/if}
        Create
      </button>
    </div>
  </div>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={() => !isSaving && (showModal = false)}></div>
</div>
{/if}
