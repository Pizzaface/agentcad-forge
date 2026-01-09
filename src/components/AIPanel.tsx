import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Pencil, BookOpen, Wrench, Send, Loader2, Brain, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AIProvider, AIAction, AIMessage, AppSettings, AI_ACTIONS } from '@/types/openscad';
import { sendAIRequest, extractCodeFromResponse } from '@/lib/ai-service';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

interface AIPanelProps {
  settings: AppSettings;
  code: string;
  selectedText: string;
  compileError: string | null;
  messages: AIMessage[];
  onCodeUpdate: (code: string) => void;
  onAddMessage: (message: AIMessage) => void;
  onClearMessages: () => void;
  onValidate: (code: string) => Promise<{ valid: boolean; errors: string[] }>;
}

const PROVIDER_ICONS: Record<AIProvider, string> = {
  claude: '🟠',
  gemini: '🔵',
  openai: '🟢',
};

const PROVIDER_NAMES: Record<AIProvider, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  openai: 'OpenAI',
};

const ACTION_ICONS: Record<AIAction, React.ReactNode> = {
  generate: <Sparkles className="h-4 w-4" />,
  modify: <Pencil className="h-4 w-4" />,
  explain: <BookOpen className="h-4 w-4" />,
  fix: <Wrench className="h-4 w-4" />,
};

export function AIPanel({ settings, code, selectedText, compileError, messages, onCodeUpdate, onAddMessage, onClearMessages, onValidate }: AIPanelProps) {
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(settings.defaultProvider);
  const [selectedAction, setSelectedAction] = useState<AIAction>('generate');
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [response, setResponse] = useState<string>('');

  const hasApiKey = settings.providers[selectedProvider].apiKey.length > 0;

  // Check if reasoning/thinking is active for current provider
  const isReasoningActive = 
    (selectedProvider === 'claude' && settings.providers.claude.thinkingBudget >= 1024) ||
    (selectedProvider === 'openai' && settings.providers.openai.reasoningEffort !== 'off');

  const getReasoningLabel = () => {
    if (selectedProvider === 'claude' && settings.providers.claude.thinkingBudget >= 1024) {
      return `Thinking ${(settings.providers.claude.thinkingBudget / 1000).toFixed(0)}k`;
    }
    if (selectedProvider === 'openai' && settings.providers.openai.reasoningEffort !== 'off') {
      const apiType = (settings.providers.openai.apiType ?? 'completions') === 'responses' ? 'Responses' : 'Completions';
      return `${apiType} • Reasoning ${settings.providers.openai.reasoningEffort}`;
    }
    return '';
  };

  const getAPITypeLabel = () => {
    if (selectedProvider === 'openai') {
      const apiType = settings.providers.openai.apiType ?? 'completions';
      return apiType === 'responses' ? 'Responses API' : 'Completions API';
    }
    return null;
  };

  // Build the effective prompt, including compile error for 'fix' action
  const buildPrompt = useCallback((userPrompt: string, validationErrors?: string[]): string => {
    let fullPrompt = userPrompt;
    
    // Add validation errors if present
    if (validationErrors && validationErrors.length > 0) {
      fullPrompt += `\n\nValidation Errors:\n${validationErrors.join('\n')}`;
    } else if (selectedAction === 'fix' && compileError) {
      fullPrompt += `\n\nCompile Error:\n${compileError}`;
    }
    
    return fullPrompt;
  }, [selectedAction, compileError]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setResponse('');

    const userMessage: AIMessage = {
      role: 'user',
      content: prompt,
      provider: selectedProvider,
      action: selectedAction,
      timestamp: new Date(),
    };
    onAddMessage(userMessage);

    let fullResponse = '';
    let validationErrors: string[] | undefined;

    // Pre-validate code for modify/fix actions to get fresh errors
    if ((selectedAction === 'modify' || selectedAction === 'fix') && code) {
      setIsValidating(true);
      try {
        const validationResult = await onValidate(code);
        if (!validationResult.valid) {
          validationErrors = validationResult.errors;
        }
      } catch (e) {
        // Continue without validation errors
      }
      setIsValidating(false);
    }

    try {
      await sendAIRequest({
        provider: selectedProvider,
        action: selectedAction,
        userMessage: buildPrompt(prompt, validationErrors),
        code,
        selectedText,
        settings,
        onChunk: (chunk) => {
          fullResponse += chunk;
          // Use functional update to ensure React processes each chunk
          setResponse(() => fullResponse);
        },
      });

      const assistantMessage: AIMessage = {
        role: 'assistant',
        content: fullResponse,
        provider: selectedProvider,
        action: selectedAction,
        timestamp: new Date(),
      };
      onAddMessage(assistantMessage);

      // Auto-apply code for certain actions
      if (selectedAction === 'generate' || selectedAction === 'modify' || selectedAction === 'fix') {
        const extractedCode = extractCodeFromResponse(fullResponse);
        if (extractedCode) {
          onCodeUpdate(extractedCode);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setResponse(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [prompt, selectedProvider, selectedAction, code, selectedText, settings, isLoading, onAddMessage, onCodeUpdate, onValidate, buildPrompt]);

  const handleApplyCode = useCallback(() => {
    const extractedCode = extractCodeFromResponse(response);
    if (extractedCode.trim()) {
      onCodeUpdate(extractedCode);
    }
  }, [response, onCodeUpdate]);

  return (
    <div className="flex h-full flex-col bg-panel">
      {/* Header */}
      <div className="border-b border-border bg-panel-header p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">AI Assistant</h3>
            {selectedProvider === 'openai' && !isReasoningActive && (
              <Badge variant="outline" className="text-xs">
                {getAPITypeLabel()}
              </Badge>
            )}
            {isReasoningActive && (
              <Badge variant="secondary" className="gap-1 text-xs bg-primary/10 text-primary border-primary/20">
                <Brain className="h-3 w-3" />
                {getReasoningLabel()}
              </Badge>
            )}
            {messages?.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearMessages}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                title="Clear conversation"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Select value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as AIProvider)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude">
                <span className="flex items-center gap-2">
                  {PROVIDER_ICONS.claude} Claude
                </span>
              </SelectItem>
              <SelectItem value="gemini">
                <span className="flex items-center gap-2">
                  {PROVIDER_ICONS.gemini} Gemini
                </span>
              </SelectItem>
              <SelectItem value="openai">
                <span className="flex items-center gap-2">
                  {PROVIDER_ICONS.openai} OpenAI
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action tabs */}
        <Tabs value={selectedAction} onValueChange={(v) => setSelectedAction(v as AIAction)}>
          <TabsList className="grid w-full grid-cols-4 h-8">
            {AI_ACTIONS.map(({ action, label }) => (
              <TabsTrigger key={action} value={action} className="text-xs gap-1">
                {ACTION_ICONS[action]}
                <span className="hidden sm:inline">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Content area */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {!hasApiKey ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
              <p className="text-sm text-destructive">
                No API key set for {PROVIDER_NAMES[selectedProvider]}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add your API key in settings to use this provider
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Compile error indicator */}
              {compileError && selectedAction === 'fix' && (
                <div className="rounded border border-destructive/50 bg-destructive/10 p-2">
                  <p className="mb-1 text-xs font-medium text-destructive">Compile error:</p>
                  <pre className="max-h-20 overflow-y-auto text-xs text-destructive/80">
                    {compileError.slice(0, 300)}{compileError.length > 300 ? '...' : ''}
                  </pre>
                </div>
              )}

              {/* Context indicator */}
              {selectedText && (
                <div className="rounded border border-border bg-muted/50 p-2">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Selected code:</p>
                  <pre className="max-h-20 overflow-y-auto text-xs">
                    {selectedText.slice(0, 200)}{selectedText.length > 200 ? '...' : ''}
                  </pre>
                </div>
              )}

              {/* Conversation history */}
              {(messages ?? []).map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "rounded-lg border p-3",
                    msg.role === 'user'
                      ? "border-primary/30 bg-primary/5 ml-4"
                      : "border-border bg-card mr-4"
                  )}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant={msg.role === 'user' ? 'default' : 'secondary'} className="text-xs">
                      {msg.role === 'user' ? 'You' : `${PROVIDER_ICONS[msg.provider]} ${PROVIDER_NAMES[msg.provider]}`}
                    </Badge>
                    {msg.action && (
                      <Badge variant="outline" className="text-xs">
                        {msg.action}
                      </Badge>
                    )}
                  </div>
                  {msg.role === 'user' ? (
                    <pre className="whitespace-pre-wrap text-xs max-h-40 overflow-y-auto">
                      {msg.content}
                    </pre>
                  ) : (
                    <div className="text-xs max-h-40 overflow-y-auto">
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  )}
                </div>
              ))}

              {/* Current streaming response */}
              {response && !(messages ?? []).find(m => m.content === response) && (
                <div className="rounded-lg border border-border bg-card p-3 mr-4">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">
                      {PROVIDER_ICONS[selectedProvider]} {PROVIDER_NAMES[selectedProvider]}
                    </Badge>
                    {(selectedAction === 'generate' || selectedAction === 'modify' || selectedAction === 'fix') && (
                      <Button size="sm" variant="outline" onClick={handleApplyCode} className="h-6 text-xs">
                        Apply to Editor
                      </Button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto text-xs">
                    <MarkdownRenderer content={response} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              selectedAction === 'generate'
                ? 'Describe the 3D object you want to create...'
                : selectedAction === 'modify'
                ? 'Describe how to modify the code...'
                : selectedAction === 'explain'
                ? 'Ask about the code...'
                : 'Describe the issue to fix...'
            }
            className="min-h-[60px] resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />
          <Button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isLoading || !hasApiKey}
            className="h-auto min-w-[60px]"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Press Cmd/Ctrl + Enter to send
        </p>
      </div>
    </div>
  );
}
