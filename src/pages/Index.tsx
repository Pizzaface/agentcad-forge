import { useState, useCallback, useEffect } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Code2, Box, Bot, ChevronLeft, ChevronRight, FileCode2, Loader2, Play } from 'lucide-react';
import { ScadEditor } from '@/components/ScadEditor';
import { ModelViewer } from '@/components/ModelViewer';
import { AIPanel } from '@/components/AIPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { STLUploader } from '@/components/STLUploader';
import { useSettings } from '@/hooks/useSettings';
import { useOpenScad } from '@/hooks/useOpenScad';
import { formatLintErrors } from '@/lib/openscad-linter';
import { OPENSCAD_TEMPLATE, AIMessage, STLMesh } from '@/types/openscad';

const CODE_STORAGE_KEY = 'openscad-creator-code';
const UI_STORAGE_KEY = 'openscad-creator-ui';
const MESSAGES_STORAGE_KEY = 'openscad-creator-messages';

function loadStoredCode(): string {
  try {
    const stored = localStorage.getItem(CODE_STORAGE_KEY);
    return stored || OPENSCAD_TEMPLATE;
  } catch {
    return OPENSCAD_TEMPLATE;
  }
}

function loadStoredUI(): { showAIPanel: boolean } {
  try {
    const stored = localStorage.getItem(UI_STORAGE_KEY);
    return stored ? JSON.parse(stored) : { showAIPanel: true };
  } catch {
    return { showAIPanel: true };
  }
}

function loadStoredMessages(): AIMessage[] {
  try {
    const stored = localStorage.getItem(MESSAGES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export default function Index() {
  const { settings, updateSettings, updateProviderKey, updateProviderModel, updateClaudeThinkingBudget, updateOpenAIReasoningEffort, updateOpenAIAPIType, toggleTheme } = useSettings();
  const [code, setCode] = useState(loadStoredCode);
  const [selectedText, setSelectedText] = useState('');
  const [uploadedMesh, setUploadedMesh] = useState<STLMesh | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>(loadStoredMessages);
  const [showAIPanel, setShowAIPanel] = useState(() => loadStoredUI().showAIPanel);
  
  // Save code to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CODE_STORAGE_KEY, code);
    } catch (e) {
      console.warn('Failed to save code:', e);
    }
  }, [code]);

  // Save UI state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ showAIPanel }));
    } catch (e) {
      console.warn('Failed to save UI state:', e);
    }
  }, [showAIPanel]);
  
  // Full OpenSCAD WASM rendering with 1.5s debounce
  const { mesh: renderedMesh, isRendering, isLoading, error, lintErrors, logs, render, forceRender, validate } = useOpenScad(true, 1500);

  // Format errors for AI context
  const formattedErrors = error 
    ? `${error}${lintErrors.length > 0 ? '\n\nLint Errors:\n' + formatLintErrors(lintErrors) : ''}`
    : lintErrors.length > 0 
      ? formatLintErrors(lintErrors) 
      : null;

  // Trigger render when code changes
  useEffect(() => {
    render(code);
  }, [code, render]);

  const handleAddMessage = useCallback((message: AIMessage) => {
    setMessages(prev => {
      const updated = [...prev, message];
      try {
        localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save messages:', e);
      }
      return updated;
    });
  }, []);

  const handleClearMessages = useCallback(() => {
    setMessages([]);
    try {
      localStorage.removeItem(MESSAGES_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear messages:', e);
    }
  }, []);

  const handleMeshLoaded = useCallback((mesh: STLMesh) => {
    setUploadedMesh(mesh);
  }, []);

  // Use uploaded mesh if available, otherwise use rendered mesh
  const meshData = uploadedMesh || renderedMesh;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-primary" />
            <h1 className="text-sm font-semibold">OpenSCAD AI Creator</h1>
          </div>
          <Badge variant="secondary" className="text-xs">
            Beta
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <STLUploader onCodeGenerated={setCode} onMeshLoaded={handleMeshLoaded} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAIPanel(!showAIPanel)}
            className="gap-1"
          >
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">AI</span>
            {showAIPanel ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
          </Button>
          <SettingsPanel
            settings={settings}
            onUpdateSettings={updateSettings}
            onUpdateProviderKey={updateProviderKey}
            onUpdateProviderModel={updateProviderModel}
            onUpdateClaudeThinkingBudget={updateClaudeThinkingBudget}
            onUpdateOpenAIReasoningEffort={updateOpenAIReasoningEffort}
            onUpdateOpenAIAPIType={updateOpenAIAPIType}
            onToggleTheme={toggleTheme}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Editor panel */}
          <ResizablePanel defaultSize={40} minSize={25}>
            <div className="flex h-full flex-col">
              <div className="flex h-9 items-center justify-between border-b border-border bg-panel-header px-3">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">OpenSCAD Editor</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => forceRender(code)}
                  disabled={isRendering || isLoading}
                  className="h-6 gap-1 px-2 text-xs"
                >
                  {isRendering ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Render
                </Button>
              </div>
              <div className="flex-1 p-2">
                <ScadEditor
                  code={code}
                  onChange={setCode}
                  onSelectionChange={setSelectedText}
                  fontSize={settings.editorFontSize}
                  lintErrors={lintErrors}
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* 3D Viewer panel */}
          <ResizablePanel defaultSize={showAIPanel ? 35 : 60} minSize={25}>
            <div className="flex h-full flex-col">
              <div className="flex h-9 items-center gap-2 border-b border-border bg-panel-header px-3">
                <Box className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium">3D Preview</span>
                {isLoading && (
                  <Badge variant="outline" className="ml-2 text-xs flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading WASM...
                  </Badge>
                )}
                {error && (
                  <Badge variant="destructive" className="ml-2 text-xs">
                    Error
                  </Badge>
                )}
                {meshData && (
                  <Badge variant="outline" className="ml-auto text-xs">
                    {(meshData.vertices.length / 9).toLocaleString()} triangles
                  </Badge>
                )}
              </div>
              <div className="relative flex-1 p-2">
                <ModelViewer meshData={meshData} isRendering={isRendering} error={error} logs={logs} />
              </div>
            </div>
          </ResizablePanel>

          {/* AI Panel */}
          {showAIPanel && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
                <div className="flex h-full flex-col">
                  <div className="flex h-9 items-center gap-2 border-b border-border bg-panel-header px-3">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium">AI Assistant</span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <AIPanel
                      settings={settings}
                      code={code}
                      selectedText={selectedText}
                      compileError={formattedErrors}
                      messages={messages}
                      onCodeUpdate={setCode}
                      onAddMessage={handleAddMessage}
                      onClearMessages={handleClearMessages}
                      onValidate={validate}
                    />
                  </div>
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
