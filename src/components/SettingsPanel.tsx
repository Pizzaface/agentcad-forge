import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Eye, EyeOff, Moon, Sun, Loader2, RefreshCw } from 'lucide-react';
import { AppSettings, AIProvider } from '@/types/openscad';
import { 
  ModelInfo, 
  fetchClaudeModels, 
  fetchGeminiModels, 
  fetchOpenAIModels,
  getFallbackModels 
} from '@/lib/model-fetcher';

interface SettingsPanelProps {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onUpdateProviderKey: (provider: AIProvider, key: string) => void;
  onUpdateProviderModel: (provider: AIProvider, model: string) => void;
  onToggleTheme: () => void;
}

export function SettingsPanel({
  settings,
  onUpdateSettings,
  onUpdateProviderKey,
  onUpdateProviderModel,
  onToggleTheme,
}: SettingsPanelProps) {
  const [showKeys, setShowKeys] = useState<Record<AIProvider, boolean>>({
    claude: false,
    gemini: false,
    openai: false,
  });

  const [models, setModels] = useState<Record<AIProvider, ModelInfo[]>>({
    claude: getFallbackModels('claude'),
    gemini: getFallbackModels('gemini'),
    openai: getFallbackModels('openai'),
  });

  const [loading, setLoading] = useState<Record<AIProvider, boolean>>({
    claude: false,
    gemini: false,
    openai: false,
  });

  const fetchModels = useCallback(async (provider: AIProvider, apiKey: string) => {
    if (!apiKey) {
      setModels(prev => ({ ...prev, [provider]: getFallbackModels(provider) }));
      return;
    }

    setLoading(prev => ({ ...prev, [provider]: true }));
    
    try {
      let fetchedModels: ModelInfo[];
      switch (provider) {
        case 'claude':
          fetchedModels = await fetchClaudeModels(apiKey);
          break;
        case 'gemini':
          fetchedModels = await fetchGeminiModels(apiKey);
          break;
        case 'openai':
          fetchedModels = await fetchOpenAIModels(apiKey);
          break;
      }
      setModels(prev => ({ ...prev, [provider]: fetchedModels }));
    } finally {
      setLoading(prev => ({ ...prev, [provider]: false }));
    }
  }, []);

  // Fetch models when API key changes (debounced)
  useEffect(() => {
    const timeouts: Record<string, NodeJS.Timeout> = {};
    
    (['claude', 'gemini', 'openai'] as AIProvider[]).forEach(provider => {
      const apiKey = settings.providers[provider].apiKey;
      if (apiKey.length > 10) {
        timeouts[provider] = setTimeout(() => {
          fetchModels(provider, apiKey);
        }, 500);
      }
    });

    return () => {
      Object.values(timeouts).forEach(clearTimeout);
    };
  }, [settings.providers.claude.apiKey, settings.providers.gemini.apiKey, settings.providers.openai.apiKey, fetchModels]);

  const toggleShowKey = (provider: AIProvider) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleKeyChange = (provider: AIProvider, key: string) => {
    onUpdateProviderKey(provider, key);
  };

  const renderProviderSection = (
    provider: AIProvider,
    icon: string,
    label: string,
    placeholder: string
  ) => (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <span className="text-lg">{icon}</span> {label} API Key
      </Label>
      <div className="flex gap-2">
        <Input
          type={showKeys[provider] ? 'text' : 'password'}
          value={settings.providers[provider].apiKey}
          onChange={(e) => handleKeyChange(provider, e.target.value)}
          placeholder={placeholder}
          className="font-mono text-xs"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => toggleShowKey(provider)}
        >
          {showKeys[provider] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      <div className="flex gap-2">
        <Select
          value={settings.providers[provider].model}
          onValueChange={(v) => onUpdateProviderModel(provider, v)}
          disabled={loading[provider]}
        >
          <SelectTrigger className="h-8 flex-1">
            {loading[provider] ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading models...
              </span>
            ) : (
              <SelectValue />
            )}
          </SelectTrigger>
          <SelectContent>
            {models[provider].map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => fetchModels(provider, settings.providers[provider].apiKey)}
          disabled={loading[provider] || !settings.providers[provider].apiKey}
          title="Refresh models"
        >
          <RefreshCw className={`h-3 w-3 ${loading[provider] ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="api-keys" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys" className="space-y-4 pt-4">
            {renderProviderSection('claude', '🟠', 'Claude', 'sk-ant-...')}
            {renderProviderSection('gemini', '🔵', 'Gemini', 'AIza...')}
            {renderProviderSection('openai', '🟢', 'OpenAI', 'sk-...')}

            <p className="text-xs text-muted-foreground">
              API keys are stored locally in your browser. Models are fetched from each provider's API.
            </p>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4 pt-4">
            {/* Theme */}
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                {settings.theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                Dark Mode
              </Label>
              <Switch
                checked={settings.theme === 'dark'}
                onCheckedChange={onToggleTheme}
              />
            </div>

            {/* Default Provider */}
            <div className="space-y-2">
              <Label>Default AI Provider</Label>
              <Select
                value={settings.defaultProvider}
                onValueChange={(v) => onUpdateSettings({ defaultProvider: v as AIProvider })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude">🟠 Claude</SelectItem>
                  <SelectItem value="gemini">🔵 Gemini</SelectItem>
                  <SelectItem value="openai">🟢 OpenAI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Editor Font Size */}
            <div className="space-y-2">
              <Label>Editor Font Size</Label>
              <Select
                value={settings.editorFontSize.toString()}
                onValueChange={(v) => onUpdateSettings({ editorFontSize: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[12, 13, 14, 15, 16, 18, 20].map(size => (
                    <SelectItem key={size} value={size.toString()}>{size}px</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
