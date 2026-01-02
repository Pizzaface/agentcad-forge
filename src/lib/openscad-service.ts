import { createOpenSCAD, OpenSCADInstance } from 'openscad-wasm';
import { parseSTL } from './stl-parser';
import { STLMesh } from '@/types/openscad';

let openscadInstance: OpenSCADInstance | null = null;
let initPromise: Promise<OpenSCADInstance> | null = null;
let loadingProgress: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
let errorLogs: string[] = [];

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
  errorLogs = [];
  
  initPromise = createOpenSCAD({
    noInitialRun: true,
    print: (text) => {
      console.log('[OpenSCAD]', text);
    },
    printErr: (text) => {
      console.warn('[OpenSCAD Error]', text);
      errorLogs.push(text);
    },
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
  errorLogs = []; // Reset error logs for this render
  
  try {
    const instance = await initOpenSCAD();
    const rawInstance = instance.getInstance();
    
    // Write code to input file
    rawInstance.FS.writeFile("/input.scad", code);
    
    // Run OpenSCAD with appropriate flags
    let exitCode: number;
    try {
      exitCode = rawInstance.callMain([
        "/input.scad", 
        "--enable=manifold",
        "-o", 
        "/output.stl"
      ]);
    } catch (mainError) {
      // callMain can throw on certain errors
      console.error('[OpenSCAD] callMain threw:', mainError);
      errorLogs.push(mainError instanceof Error ? mainError.message : String(mainError));
      exitCode = 1;
    }
    
    // Check for errors
    if (exitCode !== 0) {
      const errorMsg = errorLogs.length > 0 
        ? errorLogs.join('\n') 
        : `OpenSCAD exited with code ${exitCode}`;
      
      // Cleanup input file
      try {
        rawInstance.FS.unlink("/input.scad");
      } catch (e) {
        // Ignore cleanup errors
      }
      
      return {
        success: false,
        error: errorMsg,
        logs: errorLogs,
      };
    }
    
    // Try to read output file
    let stlContent: string;
    try {
      stlContent = rawInstance.FS.readFile("/output.stl", { encoding: "utf8" }) as string;
    } catch (e) {
      const errorMsg = errorLogs.length > 0 
        ? errorLogs.join('\n') 
        : 'No output generated. The model may be empty or have errors.';
      return {
        success: false,
        error: errorMsg,
        logs: errorLogs,
      };
    }
    
    // Check if STL is empty or has no geometry
    if (!stlContent || stlContent.trim().length < 50) {
      return {
        success: false,
        error: 'No geometry generated. Check your OpenSCAD code.',
        logs: errorLogs,
      };
    }
    
    // Cleanup
    try {
      rawInstance.FS.unlink("/input.scad");
      rawInstance.FS.unlink("/output.stl");
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Parse the STL string into mesh data
    const encoder = new TextEncoder();
    const buffer = encoder.encode(stlContent).buffer;
    const mesh = parseSTL(buffer);
    
    // Verify mesh has vertices
    if (!mesh.vertices || mesh.vertices.length === 0) {
      return {
        success: false,
        error: 'Generated STL has no geometry.',
        logs: errorLogs,
      };
    }
    
    return {
      success: true,
      mesh,
      logs,
    };
  } catch (error) {
    console.error('[OpenSCAD] renderScadToSTL error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Include any OpenSCAD error output
    const fullError = errorLogs.length > 0 
      ? `${errorMessage}\n\n${errorLogs.join('\n')}`
      : errorMessage;
    
    return {
      success: false,
      error: fullError,
      logs: errorLogs,
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
