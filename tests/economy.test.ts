import { describe, it, expect, beforeEach } from 'vitest';
import { storage, AVAILABLE_SKINS } from '../src/storage.ts';

// In-memory localStorage mock for node test runner
const memoryStorage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => memoryStorage.get(key) || null,
  setItem: (key: string, val: string) => memoryStorage.set(key, val),
  clear: () => memoryStorage.clear(),
  removeItem: (key: string) => memoryStorage.delete(key),
  length: 0,
  key: () => null,
};

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as unknown as { localStorage: typeof mockLocalStorage }).localStorage = mockLocalStorage;
}

describe('Beat Coins & Hovercraft Garage Economy', () => {
  beforeEach(() => {
    memoryStorage.clear();
  });

  it('provides 5 collectible hovercraft skins with unique palettes', () => {
    expect(AVAILABLE_SKINS.length).toBe(5);
    const starter = AVAILABLE_SKINS[0];
    expect(starter.id).toBe('interceptor');
    expect(starter.cost).toBe(0);

    for (const skin of AVAILABLE_SKINS) {
      expect(skin.primaryColor).toBeDefined();
      expect(skin.secondaryColor).toBeDefined();
      expect(skin.glowColor).toBeDefined();
      expect(skin.trailColor).toBeDefined();
    }
  });

  it('manages coins balance correctly', () => {
    const initial = storage.getCoins();
    storage.addCoins(100);
    expect(storage.getCoins()).toBe(initial + 100);

    const spent = storage.spendCoins(50);
    expect(spent).toBe(true);
    expect(storage.getCoins()).toBe(initial + 50);

    const overspent = storage.spendCoins(99999);
    expect(overspent).toBe(false);
  });

  it('handles unlocking and equipping skins with currency checks', () => {
    expect(storage.isSkinUnlocked('interceptor')).toBe(true);

    // Give coins for funk_cruiser (cost 250)
    storage.addCoins(500);
    const unlocked = storage.unlockSkin('funk_cruiser');
    expect(unlocked).toBe(true);
    expect(storage.isSkinUnlocked('funk_cruiser')).toBe(true);
    expect(storage.getEquippedSkin().id).toBe('funk_cruiser');

    // Equipping starter back
    const equipped = storage.equipSkin('interceptor');
    expect(equipped).toBe(true);
    expect(storage.getEquippedSkin().id).toBe('interceptor');
  });
});
