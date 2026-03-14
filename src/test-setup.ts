import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri API
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}));

// Happy DOM may not provide browser dialog APIs in all runs.
if (typeof globalThis.alert !== 'function') {
  (globalThis as any).alert = vi.fn();
}
if (typeof globalThis.confirm !== 'function') {
  (globalThis as any).confirm = vi.fn(() => true);
}

// Make mockInvoke available globally for tests
(global as any).mockInvoke = mockInvoke;