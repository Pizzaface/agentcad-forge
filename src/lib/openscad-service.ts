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
  const renderErrorLogs: string[] = []; // Local error logs for this render
  
  try {
    const instance = await initOpenSCAD();
    const rawInstance = instance.getInstance();
    
    // Override printErr temporarily to capture errors for this render
    const originalPrintErr = rawInstance.printErr;
    rawInstance.printErr = (text: string) => {
      console.warn('[OpenSCAD Error]', text);
      renderErrorLogs.push(text);
    };
    
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
      // callMain throws the exit code as a number on error
      console.error('[OpenSCAD] callMain threw:', mainError);
      exitCode = typeof mainError === 'number' ? mainError : 1;
    } finally {
      // Restore original printErr
      if (originalPrintErr) {
        rawInstance.printErr = originalPrintErr;
      }
    }
    
    // Check for errors
    if (exitCode !== 0) {
      const errorMsg = renderErrorLogs.length > 0 
        ? renderErrorLogs.join('\n') 
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
        logs: renderErrorLogs,
      };
    }
    
    // Try to read output file
    let stlContent: string;
    try {
      stlContent = rawInstance.FS.readFile("/output.stl", { encoding: "utf8" }) as string;
    } catch (e) {
      const errorMsg = renderErrorLogs.length > 0 
        ? renderErrorLogs.join('\n') 
        : 'No output generated. The model may be empty or have errors.';
      return {
        success: false,
        error: errorMsg,
        logs: renderErrorLogs,
      };
    }
    
    // Check if STL is empty or has no geometry
    if (!stlContent || stlContent.trim().length < 50) {
      return {
        success: false,
        error: 'No geometry generated. Check your OpenSCAD code.',
        logs: renderErrorLogs,
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
        logs: renderErrorLogs,
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
    const fullError = renderErrorLogs.length > 0 
      ? `${errorMessage}\n\n${renderErrorLogs.join('\n')}`
      : errorMessage;
    
    return {
      success: false,
      error: fullError,
      logs: renderErrorLogs,
    };
  }
}

/**
 * Quick validation pass - runs OpenSCAD in preview mode to check for errors
 * without generating full geometry. Much faster than full render.
 */
export async function validateScadCode(code: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    const instance = await initOpenSCAD();
    const rawInstance = instance.getInstance();
    
    // Capture errors for this validation
    const originalPrintErr = rawInstance.printErr;
    rawInstance.printErr = (text: string) => {
      errors.push(text);
    };
    
    // Write code to input file
    rawInstance.FS.writeFile("/validate.scad", code);
    
    // Run in preview mode (faster, no CGAL)
    let exitCode: number;
    try {
      exitCode = rawInstance.callMain([
        "/validate.scad",
        "--preview",
        "-o", "/dev/null"
      ]);
    } catch (mainError) {
      exitCode = typeof mainError === 'number' ? mainError : 1;
    } finally {
      if (originalPrintErr) {
        rawInstance.printErr = originalPrintErr;
      }
    }
    
    // Cleanup
    try {
      rawInstance.FS.unlink("/validate.scad");
    } catch (e) {
      // Ignore cleanup errors
    }
    
    return {
      valid: exitCode === 0 && errors.length === 0,
      errors,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Validation failed'],
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
