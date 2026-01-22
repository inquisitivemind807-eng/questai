import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [sveltekit()],
    server: {
      port: 1420,
      host: '0.0.0.0'
    },
    test: {
      include: ['src/**/*.{test,spec}.{js,ts}'],
      globals: true,
      environment: 'happy-dom',
      setupFiles: ['src/test-setup.ts'],
      alias: {
        $app: '/mock/app',
        $lib: '/src/lib'
      }
    },
    resolve: {
      conditions: ['browser']
    }
  };
});