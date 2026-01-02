import { AIProvider } from '@/types/openscad';

export interface ModelInfo {
  value: string;
  label: string;
}

// Fallback models if API fetch fails
const FALLBACK_MODELS: Record<AIProvider, ModelInfo[]> = {
  claude: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
};

export async function fetchClaudeModels(apiKey: string): Promise<ModelInfo[]> {
  if (!apiKey) return FALLBACK_MODELS.claude;
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    
    if (!response.ok) {
      console.warn('Failed to fetch Claude models:', response.status);
      return FALLBACK_MODELS.claude;
    }
    
    const data = await response.json();
    const models: ModelInfo[] = data.data
      .filter((m: any) => m.id.includes('claude') && !m.id.includes('instant'))
      .map((m: any) => ({
        value: m.id,
        label: formatModelName(m.id, 'claude'),
      }))
      .sort((a: ModelInfo, b: ModelInfo) => b.value.localeCompare(a.value));
    
    return models.length > 0 ? models : FALLBACK_MODELS.claude;
  } catch (error) {
    console.warn('Error fetching Claude models:', error);
    return FALLBACK_MODELS.claude;
  }
}

export async function fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  if (!apiKey) return FALLBACK_MODELS.gemini;
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    
    if (!response.ok) {
      console.warn('Failed to fetch Gemini models:', response.status);
      return FALLBACK_MODELS.gemini;
    }
    
    const data = await response.json();
    const models: ModelInfo[] = data.models
      .filter((m: any) => 
        m.name.includes('gemini') && 
        m.supportedGenerationMethods?.includes('generateContent')
      )
      .map((m: any) => {
        const id = m.name.replace('models/', '');
        return {
          value: id,
          label: m.displayName || formatModelName(id, 'gemini'),
        };
      })
      .sort((a: ModelInfo, b: ModelInfo) => b.value.localeCompare(a.value));
    
    return models.length > 0 ? models : FALLBACK_MODELS.gemini;
  } catch (error) {
    console.warn('Error fetching Gemini models:', error);
    return FALLBACK_MODELS.gemini;
  }
}

export async function fetchOpenAIModels(apiKey: string): Promise<ModelInfo[]> {
  if (!apiKey) return FALLBACK_MODELS.openai;
  
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (!response.ok) {
      console.warn('Failed to fetch OpenAI models:', response.status);
      return FALLBACK_MODELS.openai;
    }
    
    const data = await response.json();
    const models: ModelInfo[] = data.data
      .filter((m: any) => 
        (m.id.startsWith('gpt-4') || m.id.startsWith('gpt-3.5')) &&
        !m.id.includes('instruct') &&
        !m.id.includes('vision') &&
        !m.id.includes('realtime')
      )
      .map((m: any) => ({
        value: m.id,
        label: formatModelName(m.id, 'openai'),
      }))
      .sort((a: ModelInfo, b: ModelInfo) => {
        // Prioritize gpt-4o, then gpt-4, then gpt-3.5
        if (a.value.includes('gpt-4o') && !b.value.includes('gpt-4o')) return -1;
        if (!a.value.includes('gpt-4o') && b.value.includes('gpt-4o')) return 1;
        return b.value.localeCompare(a.value);
      });
    
    return models.length > 0 ? models : FALLBACK_MODELS.openai;
  } catch (error) {
    console.warn('Error fetching OpenAI models:', error);
    return FALLBACK_MODELS.openai;
  }
}

function formatModelName(id: string, provider: AIProvider): string {
  if (provider === 'claude') {
    if (id.includes('claude-sonnet-4')) return 'Claude Sonnet 4';
    if (id.includes('claude-3-5-sonnet')) return 'Claude 3.5 Sonnet';
    if (id.includes('claude-3-5-haiku')) return 'Claude 3.5 Haiku';
    if (id.includes('claude-3-opus')) return 'Claude 3 Opus';
    if (id.includes('claude-3-sonnet')) return 'Claude 3 Sonnet';
    if (id.includes('claude-3-haiku')) return 'Claude 3 Haiku';
    return id;
  }
  
  if (provider === 'gemini') {
    return id
      .replace('gemini-', 'Gemini ')
      .replace('-latest', '')
      .replace('-', ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  
  if (provider === 'openai') {
    if (id === 'gpt-4o') return 'GPT-4o';
    if (id === 'gpt-4o-mini') return 'GPT-4o Mini';
    if (id.includes('gpt-4-turbo')) return 'GPT-4 Turbo';
    if (id.includes('gpt-4')) return 'GPT-4';
    if (id.includes('gpt-3.5-turbo')) return 'GPT-3.5 Turbo';
    return id.toUpperCase();
  }
  
  return id;
}

export function getFallbackModels(provider: AIProvider): ModelInfo[] {
  return FALLBACK_MODELS[provider];
}
