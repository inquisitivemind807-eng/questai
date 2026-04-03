<script lang="ts">
  import { FONT_NAMES, getFontFamily, getFontInfo } from '../fonts';
  import type { ResumeData } from '../types';
  
  interface Props {
    resume: ResumeData | null;
  }
  
  let { resume }: Props = $props();
  
  // Drag state
  let position = $state({ x: 0, y: 0 });
  let isDragging = $state(false);
  let dragOffset = $state({ x: 0, y: 0 });
  let panelElement: HTMLDivElement;
  
  function startDrag(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.drag-handle')) return;
    isDragging = true;
    const rect = panelElement.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    e.preventDefault();
  }
  
  function drag(e: MouseEvent) {
    if (!isDragging) return;
    // Calculate position relative to the fixed left position (20px)
    position.x = e.clientX - dragOffset.x - 20;
    position.y = e.clientY - dragOffset.y - 100;
  }
  
  function stopDrag() {
    isDragging = false;
  }
  
  $effect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', drag);
      document.addEventListener('mouseup', stopDrag);
      return () => {
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
      };
    }
  });
  
  // Initialize font settings if not exists - reactive
  $effect(() => {
    if (resume && !resume.fontSettings) {
      resume.fontSettings = {
        headerFont: 'Arial',
        bodyFont: 'Calibri',
        contactFont: 'Arial',
        headerFontSize: 14,
        bodyFontSize: 11,
        contactFontSize: 10,
        nameFontSize: 16,
        letterSpacing: 'normal',
        lineSpacing: 1.15,
        sectionSpacing: 'normal',
        useTemplateFonts: true,
      };
      // Force reactivity
      resume = { ...resume };
    }
  });
  
  // Initialize font settings if not exists
  function ensureFontSettings() {
    if (!resume || !resume.fontSettings) {
      if (!resume) return;
      resume.fontSettings = {
        headerFont: 'Arial',
        bodyFont: 'Calibri',
        contactFont: 'Arial',
        headerFontSize: 14,
        bodyFontSize: 11,
        contactFontSize: 10,
        nameFontSize: 16,
        letterSpacing: 'normal',
        lineSpacing: 1.15,
        sectionSpacing: 'normal',
        useTemplateFonts: true,
      };
    }
  }
  
  
  function resetToDefaults() {
    if (!resume) return;
    ensureFontSettings();
    if (resume.fontSettings) {
      resume.fontSettings.useTemplateFonts = true;
      resume.fontSettings.headerFont = 'Arial';
      resume.fontSettings.bodyFont = 'Calibri';
      resume.fontSettings.contactFont = 'Arial';
      resume.fontSettings.headerFontSize = 14;
      resume.fontSettings.bodyFontSize = 11;
      resume.fontSettings.contactFontSize = 10;
      resume.fontSettings.nameFontSize = 16;
    }
  }
  
  // Font size bounds
  const minHeaderSize = 12;
  const maxHeaderSize = 18;
  const minBodySize = 9;
  const maxBodySize = 14;
  const minContactSize = 8;
  const maxContactSize = 12;
  const minNameSize = 14;
  const maxNameSize = 20;
</script>

<div 
  bind:this={panelElement}
  class="font-controls-panel bg-base-200 rounded-lg shadow-lg"
  style="position: fixed; left: 20px; top: 100px; width: 300px; z-index: 100; transform: translate({position.x}px, {position.y}px); max-height: calc(100vh - 120px); overflow-y: auto;"
  onmousedown={startDrag}
  role="presentation">
  <!-- Draggable Header -->
  <div class="drag-handle w-full flex items-center justify-between p-4 bg-base-300 rounded-t-lg cursor-move">
    <div class="flex items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span class="font-semibold">Font Settings</span>
    </div>
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
    </svg>
  </div>
  
  {#if resume}
    <div class="p-4 space-y-6">
      <!-- All Font Controls Always Visible -->
        <!-- Header Font -->
        <div class="space-y-2">
          <label class="label">
            <span class="label-text font-medium">Header Font</span>
          </label>
          <select 
            class="select select-bordered select-sm w-full"
            value={resume.fontSettings?.headerFont || 'Arial'}
            onchange={(e) => {
              ensureFontSettings();
              if (resume?.fontSettings) {
                resume.fontSettings.headerFont = (e.target as HTMLSelectElement).value;
              }
            }}>
            {#each FONT_NAMES as fontName}
              <option value={fontName}>{fontName}</option>
            {/each}
          </select>
          <div class="flex items-center gap-4">
            <label class="label">
              <span class="label-text text-xs">Size: {resume.fontSettings?.headerFontSize || 14}pt</span>
            </label>
            <input 
              type="range" 
              min={minHeaderSize} 
              max={maxHeaderSize} 
              value={resume.fontSettings?.headerFontSize || 14}
              oninput={(e) => {
                ensureFontSettings();
                if (resume?.fontSettings) {
                  resume.fontSettings.headerFontSize = parseInt((e.target as HTMLInputElement).value);
                }
              }}
              class="range range-primary range-xs flex-1"
            />
          </div>
        </div>
        
        <!-- Body Font -->
        <div class="space-y-2">
          <label class="label">
            <span class="label-text font-medium">Body Font</span>
          </label>
          <select 
            class="select select-bordered select-sm w-full"
            value={resume.fontSettings?.bodyFont || 'Calibri'}
            onchange={(e) => {
              ensureFontSettings();
              if (resume?.fontSettings) {
                resume.fontSettings.bodyFont = (e.target as HTMLSelectElement).value;
              }
            }}>
            {#each FONT_NAMES as fontName}
              <option value={fontName}>{fontName}</option>
            {/each}
          </select>
          <div class="flex items-center gap-4">
            <label class="label">
              <span class="label-text text-xs">Size: {resume.fontSettings?.bodyFontSize || 11}pt</span>
            </label>
            <input 
              type="range" 
              min={minBodySize} 
              max={maxBodySize} 
              value={resume.fontSettings?.bodyFontSize || 11}
              oninput={(e) => {
                ensureFontSettings();
                if (resume?.fontSettings) {
                  resume.fontSettings.bodyFontSize = parseInt((e.target as HTMLInputElement).value);
                }
              }}
              class="range range-primary range-xs flex-1"
            />
          </div>
        </div>
        
        <!-- Contact Font -->
        <div class="space-y-2">
          <label class="label">
            <span class="label-text font-medium">Contact Font</span>
          </label>
          <select 
            class="select select-bordered select-sm w-full"
            value={resume.fontSettings?.contactFont || 'Arial'}
            onchange={(e) => {
              ensureFontSettings();
              if (resume?.fontSettings) {
                resume.fontSettings.contactFont = (e.target as HTMLSelectElement).value;
              }
            }}>
            {#each FONT_NAMES as fontName}
              <option value={fontName}>{fontName}</option>
            {/each}
          </select>
          <div class="flex items-center gap-4">
            <label class="label">
              <span class="label-text text-xs">Size: {resume.fontSettings?.contactFontSize || 10}pt</span>
            </label>
            <input 
              type="range" 
              min={minContactSize} 
              max={maxContactSize} 
              value={resume.fontSettings?.contactFontSize || 10}
              oninput={(e) => {
                ensureFontSettings();
                if (resume?.fontSettings) {
                  resume.fontSettings.contactFontSize = parseInt((e.target as HTMLInputElement).value);
                }
              }}
              class="range range-primary range-xs flex-1"
            />
          </div>
        </div>
        
        <!-- Name Font Size -->
        <div class="space-y-2">
          <label class="label">
            <span class="label-text font-medium">Name Size</span>
          </label>
          <div class="flex items-center gap-4">
            <label class="label">
              <span class="label-text text-xs">{resume.fontSettings?.nameFontSize || 16}pt</span>
            </label>
            <input 
              type="range" 
              min={minNameSize} 
              max={maxNameSize} 
              value={resume.fontSettings?.nameFontSize || 16}
              oninput={(e) => {
                ensureFontSettings();
                if (resume?.fontSettings) {
                  resume.fontSettings.nameFontSize = parseInt((e.target as HTMLInputElement).value);
                }
              }}
              class="range range-primary range-xs flex-1"
            />
          </div>
        </div>
        
      <!-- Reset Button -->
      <div class="pt-2 border-t border-base-300">
        <button 
          class="btn btn-sm btn-outline w-full"
          onclick={resetToDefaults}>
          Reset to Defaults
        </button>
      </div>
    </div>
  {:else}
    <div class="p-4 text-center text-base-content/70 border-t border-base-300">
      <p>Loading resume data...</p>
    </div>
  {/if}
</div>

<style>
  .font-controls-panel {
    transition: box-shadow 0.2s ease;
  }
  
  .font-controls-panel:active {
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  }
  
  .drag-handle {
    user-select: none;
  }
  
  .drag-handle:hover {
    background-color: hsl(var(--b3, var(--bc) / 0.1));
  }
</style>
