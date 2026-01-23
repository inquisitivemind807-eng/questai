/**
 * Token Store - Reactive Svelte store for token balance
 */
import { writable } from 'svelte/store';
import { tokenService } from '../services/tokenService.js';

// Create writable store
function createTokenStore() {
  const { subscribe, set, update } = writable({
    balance: 0,
    totalPurchased: 0,
    totalUsed: 0,
    lastPurchaseAt: null,
    lastUsageAt: null,
    loading: false,
    error: null
  });

  return {
    subscribe,

    /**
     * Load token balance from API
     */
    async load() {
      update(state => ({ ...state, loading: true, error: null }));
      try {
        const data = await tokenService.getBalance();
        set({
          balance: data.tokenBalance || 0,
          totalPurchased: data.totalPurchased || 0,
          totalUsed: data.totalUsed || 0,
          lastPurchaseAt: data.lastPurchaseAt,
          lastUsageAt: data.lastUsageAt,
          loading: false,
          error: null
        });
      } catch (error) {
        update(state => ({
          ...state,
          loading: false,
          error: error.message
        }));
        console.error('Failed to load token balance:', error);
      }
    },

    /**
     * Update balance locally (optimistic update)
     */
    deduct(amount) {
      update(state => ({
        ...state,
        balance: Math.max(0, state.balance - amount),
        totalUsed: state.totalUsed + amount
      }));
    },

    /**
     * Add tokens locally (optimistic update)
     */
    add(amount) {
      update(state => ({
        ...state,
        balance: state.balance + amount,
        totalPurchased: state.totalPurchased + amount
      }));
    },

    /**
     * Reset store
     */
    reset() {
      set({
        balance: 0,
        totalPurchased: 0,
        totalUsed: 0,
        lastPurchaseAt: null,
        lastUsageAt: null,
        loading: false,
        error: null
      });
    }
  };
}

export const tokenStore = createTokenStore();
