<script>
  import JobTrackerBase from "$lib/components/JobTrackerBase.svelte";
</script>

<div class="bg-base-200 min-h-screen">
  <div class="mb-2 px-6 pt-4">
    <p class="text-sm text-base-content/60">
      LinkedIn Easy Apply jobs are shown as <span class="badge badge-success badge-outline badge-xs">Internal</span> in the Type column.
    </p>
  </div>
  <JobTrackerBase 
    platform="linkedin" 
    bots={["linkedin_extract_bot", "linkedin_apply_bot"]} 
    enableEasyApplyFilter={true}
  />
</div>
