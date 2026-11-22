import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { language, languageChoice, setLanguage } from '../src/settings';

beforeEach(() => {
  const held = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
    removeItem: (key: string) => void held.delete(key),
  });
  vi.stubGlobal('navigator', { language: 'pt-BR' });
});

afterEach(() => vi.unstubAllGlobals());

describe('the language', () => {
  it('follows the device again once the person picks the device language over a chosen one', () => {
    setLanguage('en');
    expect(language()).toBe('en');
    setLanguage('device');
    expect(languageChoice()).toBe('device');
    expect(language()).toBe('pt-PT');
  });
});
