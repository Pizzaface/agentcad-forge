export type AIProvider = 'claude' | 'gemini' | 'openai';

export type AIAction = 'generate' | 'modify' | 'explain' | 'fix';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  provider?: AIProvider;
  action?: AIAction;
  timestamp: Date;
}

export interface AIProviderConfig {
  name: string;
  provider: AIProvider;
  model: string;
  apiKey: string;
  color: string;
}

export interface STLMesh {
  vertices: Float32Array;
  normals: Float32Array;
  indices?: Uint32Array;
}

export interface EditorState {
  code: string;
  selectedText: string;
  cursorPosition: { line: number; column: number };
}

export interface ViewerState {
  meshData: STLMesh | null;
  isLoading: boolean;
  error: string | null;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  providers: {
    claude: { apiKey: string; model: string };
    gemini: { apiKey: string; model: string };
    openai: { apiKey: string; model: string };
  };
  defaultProvider: AIProvider;
  editorFontSize: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  providers: {
    claude: { apiKey: '', model: 'claude-sonnet-4-20250514' },
    gemini: { apiKey: '', model: 'gemini-2.5-flash' },
    openai: { apiKey: '', model: 'gpt-5' },
  },
  defaultProvider: 'claude',
  editorFontSize: 14,
};

export const OPENSCAD_TEMPLATE = `// OpenSCAD Model
// Generated with OpenSCAD AI Creator

// Example: A simple cube with a cylinder hole
difference() {
    cube([20, 20, 20], center = true);
    cylinder(h = 25, r = 5, center = true, $fn = 32);
}
`;

export const AI_ACTIONS: { action: AIAction; label: string; description: string; icon: string }[] = [
  { action: 'generate', label: 'Generate', description: 'Create SCAD from description', icon: 'Sparkles' },
  { action: 'modify', label: 'Modify', description: 'Change selected code', icon: 'Pencil' },
  { action: 'explain', label: 'Explain', description: 'Describe what code does', icon: 'BookOpen' },
  { action: 'fix', label: 'Fix Errors', description: 'Fix syntax or logic errors', icon: 'Wrench' },
];
