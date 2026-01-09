import { useState, useEffect, useCallback } from 'react';
import { AppSettings, DEFAULT_SETTINGS, AIProvider, ReasoningEffort, OpenAIAPIType } from '@/types/openscad';

const STORAGE_KEY = 'openscad-creator-settings';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Deep merge providers to ensure new properties are included
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          providers: {
            claude: { ...DEFAULT_SETTINGS.providers.claude, ...parsed.providers?.claude },
            gemini: { ...DEFAULT_SETTINGS.providers.gemini, ...parsed.providers?.gemini },
            openai: { ...DEFAULT_SETTINGS.providers.openai, ...parsed.providers?.openai },
          },
        };
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }, [settings]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const updateProviderKey = useCallback((provider: keyof AppSettings['providers'], apiKey: string) => {
    setSettings(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: { ...prev.providers[provider], apiKey },
      },
    }));
  }, []);

  const updateProviderModel = useCallback((provider: keyof AppSettings['providers'], model: string) => {
    setSettings(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: { ...prev.providers[provider], model },
      },
    }));
  }, []);

  const updateClaudeThinkingBudget = useCallback((thinkingBudget: number) => {
    setSettings(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        claude: { ...prev.providers.claude, thinkingBudget },
      },
    }));
  }, []);

  const updateOpenAIReasoningEffort = useCallback((reasoningEffort: ReasoningEffort) => {
    setSettings(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        openai: { ...prev.providers.openai, reasoningEffort },
      },
    }));
  }, []);

  const updateOpenAIAPIType = useCallback((apiType: OpenAIAPIType) => {
    setSettings(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        openai: { ...prev.providers.openai, apiType },
      },
    }));
  }, []);

  const toggleTheme = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));
  }, []);

  return {
    settings,
    updateSettings,
    updateProviderKey,
    updateProviderModel,
    updateClaudeThinkingBudget,
    updateOpenAIReasoningEffort,
    updateOpenAIAPIType,
    toggleTheme,
  };
}
