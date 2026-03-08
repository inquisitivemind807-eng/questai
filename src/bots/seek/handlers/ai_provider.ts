import type { WorkflowContext } from '../../core/workflow_engine';

/**
 * Returns an AI provider for corpus-rag requests.
 * DeepSeek is used only when explicitly enabled with a key.
 * Otherwise use a safe default model to satisfy endpoints that require useAi.
 */
export function resolveUseAi(ctx: WorkflowContext): string {
  const formData = (((ctx as any)?.config || {}) as any).formData || {};
  const enableDeepSeek = Boolean(formData.enableDeepSeek);
  const deepSeekApiKey = String(formData.deepSeekApiKey || '').trim();
  if (enableDeepSeek && deepSeekApiKey) {
    return 'deepseek-chat';
  }
  return 'gpt-4o-mini';
}
