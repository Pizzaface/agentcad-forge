import { createOpenSCAD, OpenSCADInstance } from 'openscad-wasm';
import { parseSTL } from './stl-parser';
import { STLMesh } from '@/types/openscad';

let openscadInstance: OpenSCADInstance | null = null;
let initPromise: Promise<OpenSCADInstance> | null = null;
let loadingProgress: 'idle' | 'loading' | 'ready' | 'error' = 'idle';

export interface RenderResult {
  success: boolean;
  mesh?: STLMesh;
  error?: string;
  logs?: string[];
}

export function getLoadingStatus() {
  return loadingProgress;
}

export async function initOpenSCAD(): Promise<OpenSCADInstance> {
  if (openscadInstance) {
    return openscadInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  loadingProgress = 'loading';
  
  initPromise = createOpenSCAD({
    noInitialRun: true,
    print: (text) => console.log('[OpenSCAD]', text),
    printErr: (text) => console.warn('[OpenSCAD Error]', text),
  }).then((instance) => {
    openscadInstance = instance;
    loadingProgress = 'ready';
    console.log('[OpenSCAD] WASM module initialized');
    return instance;
  }).catch((error) => {
    loadingProgress = 'error';
    console.error('[OpenSCAD] Failed to initialize:', error);
    throw error;
  });

  return initPromise;
}

export async function renderScadToSTL(code: string): Promise<RenderResult> {
  const logs: string[] = [];
  
  try {
    const instance = await initOpenSCAD();
    const stlContent = await instance.renderToStl(code);
    
    // Parse the STL string into mesh data
    // The STL is in ASCII format, so we convert it to ArrayBuffer
    const encoder = new TextEncoder();
    const buffer = encoder.encode(stlContent).buffer;
    const mesh = parseSTL(buffer);
    
    return {
      success: true,
      mesh,
      logs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`Error: ${errorMessage}`);
    
    return {
      success: false,
      error: errorMessage,
      logs,
    };
  }
}

// Preload OpenSCAD in the background
export function preloadOpenSCAD(): void {
  if (loadingProgress === 'idle') {
    initOpenSCAD().catch(() => {
      // Errors are already logged in initOpenSCAD
    });
  }
}
