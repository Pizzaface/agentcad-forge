import { useState, useCallback } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Code2, Box, Bot, ChevronLeft, ChevronRight, FileCode2 } from 'lucide-react';
import { ScadEditor } from '@/components/ScadEditor';
import { ModelViewer } from '@/components/ModelViewer';
import { AIPanel } from '@/components/AIPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { STLUploader } from '@/components/STLUploader';
import { useSettings } from '@/hooks/useSettings';
import { OPENSCAD_TEMPLATE, AIMessage, STLMesh } from '@/types/openscad';

export default function Index() {
  const { settings, updateSettings, updateProviderKey, updateProviderModel, toggleTheme } = useSettings();
  const [code, setCode] = useState(OPENSCAD_TEMPLATE);
  const [selectedText, setSelectedText] = useState('');
  const [meshData, setMeshData] = useState<STLMesh | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [showAIPanel, setShowAIPanel] = useState(true);

  const handleAddMessage = useCallback((message: AIMessage) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const handleMeshLoaded = useCallback((mesh: STLMesh) => {
    setMeshData(mesh);
  }, []);

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
              <div className="flex h-9 items-center gap-2 border-b border-border bg-panel-header px-3">
                <Code2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium">OpenSCAD Editor</span>
              </div>
              <div className="flex-1 p-2">
                <ScadEditor
                  code={code}
                  onChange={setCode}
                  onSelectionChange={setSelectedText}
                  fontSize={settings.editorFontSize}
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
                {meshData && (
                  <Badge variant="outline" className="ml-auto text-xs">
                    {(meshData.vertices.length / 9).toLocaleString()} triangles
                  </Badge>
                )}
              </div>
              <div className="relative flex-1 p-2">
                <ModelViewer meshData={meshData} />
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
                      onCodeUpdate={setCode}
                      onAddMessage={handleAddMessage}
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
