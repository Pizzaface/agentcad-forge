import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Eye, EyeOff, Moon, Sun } from 'lucide-react';
import { AppSettings, AIProvider } from '@/types/openscad';

interface SettingsPanelProps {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onUpdateProviderKey: (provider: AIProvider, key: string) => void;
  onUpdateProviderModel: (provider: AIProvider, model: string) => void;
  onToggleTheme: () => void;
}

const CLAUDE_MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
];

const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
];

const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
];

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

  const toggleShowKey = (provider: AIProvider) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

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
            {/* Claude */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="text-lg">🟠</span> Claude API Key
              </Label>
              <div className="flex gap-2">
                <Input
                  type={showKeys.claude ? 'text' : 'password'}
                  value={settings.providers.claude.apiKey}
                  onChange={(e) => onUpdateProviderKey('claude', e.target.value)}
                  placeholder="sk-ant-..."
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => toggleShowKey('claude')}
                >
                  {showKeys.claude ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Select
                value={settings.providers.claude.model}
                onValueChange={(v) => onUpdateProviderModel('claude', v)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLAUDE_MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Gemini */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="text-lg">🔵</span> Gemini API Key
              </Label>
              <div className="flex gap-2">
                <Input
                  type={showKeys.gemini ? 'text' : 'password'}
                  value={settings.providers.gemini.apiKey}
                  onChange={(e) => onUpdateProviderKey('gemini', e.target.value)}
                  placeholder="AIza..."
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => toggleShowKey('gemini')}
                >
                  {showKeys.gemini ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Select
                value={settings.providers.gemini.model}
                onValueChange={(v) => onUpdateProviderModel('gemini', v)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GEMINI_MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* OpenAI */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="text-lg">🟢</span> OpenAI API Key
              </Label>
              <div className="flex gap-2">
                <Input
                  type={showKeys.openai ? 'text' : 'password'}
                  value={settings.providers.openai.apiKey}
                  onChange={(e) => onUpdateProviderKey('openai', e.target.value)}
                  placeholder="sk-..."
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => toggleShowKey('openai')}
                >
                  {showKeys.openai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Select
                value={settings.providers.openai.model}
                onValueChange={(v) => onUpdateProviderModel('openai', v)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENAI_MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              API keys are stored locally in your browser and never sent to our servers.
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
