<script lang="ts">
  interface Props {
    id: string;
    title: string;
    defaultPosition?: { x: number; y: number };
    defaultSize?: { width: number | string; height: number | string };
    children: any;
  }
  
  let { id, title, defaultPosition = { x: 0, y: 0 }, defaultSize = { width: 100, height: 'auto' }, children }: Props = $props();
  
  let position = $state({ x: defaultPosition.x, y: defaultPosition.y });
  let isDragging = $state(false);
  let dragOffset = $state({ x: 0, y: 0 });
  
  function startDrag(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('.drag-handle')) return;
    isDragging = true;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    e.preventDefault();
  }
  
  function drag(e: MouseEvent) {
    if (!isDragging) return;
    position.x = e.clientX - dragOffset.x;
    position.y = e.clientY - dragOffset.y;
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
</script>

<div 
  class="draggable-panel"
  style="position: relative; transform: translate({position.x}px, {position.y}px); width: {typeof defaultSize.width === 'number' ? `${defaultSize.width}px` : defaultSize.width};"
  onmousedown={startDrag}
  role="presentation">
  <div class="drag-handle cursor-move bg-base-300 p-2 rounded-t-lg flex items-center justify-between">
    <span class="font-semibold text-sm">{title}</span>
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
    </svg>
  </div>
  <div class="panel-content">
    {@render children()}
  </div>
</div>

<style>
  .draggable-panel {
    user-select: none;
    z-index: 10;
  }
  
  .drag-handle {
    user-select: none;
  }
  
  .panel-content {
    overflow: visible;
  }
</style>

