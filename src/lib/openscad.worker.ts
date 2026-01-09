import { createOpenSCAD } from 'openscad-wasm';
import type { OpenSCAD } from 'openscad-wasm';
import { parseSTL } from './stl-parser';

let openscadRaw: OpenSCAD | null = null;
let initPromise: Promise<OpenSCAD> | null = null;

// Web Workers don't await async event handlers; without an explicit queue, multiple
// render/validate requests can run concurrently and stomp on the shared FS.
let opQueue: Promise<void> = Promise.resolve();

// Global stderr collector - cleared before each operation, collected during
// Note: Emscripten callbacks are set at creation time and cannot be reassigned
let currentStderr: string[] = [];
let currentRequestId: string | null = null;

async function initOpenSCAD(): Promise<OpenSCAD> {
  if (openscadRaw) return openscadRaw;
  if (initPromise) return initPromise;

  initPromise = createOpenSCAD({
    noInitialRun: true,
    print: (text: string) => {
      self.postMessage({ type: 'log', text });
    },
    printErr: (text: string) => {
      // Collect stderr for current operation
      currentStderr.push(text);
      self.postMessage({ type: 'stderr', text, id: currentRequestId });
    },
    // Keep runtime alive for multiple callMain invocations
    noExitRuntime: true,
  } as Parameters<typeof createOpenSCAD>[0]).then((instance) => {
    openscadRaw = instance.getInstance();
    self.postMessage({ type: 'ready' });
    return openscadRaw;
  });

  return initPromise;
}

type MessageType = 
  | { type: 'init' }
  | { type: 'render'; code: string; id: string }
  | { type: 'validate'; code: string; id: string };

async function renderScadToSTL(code: string, id: string) {
  // Reset stderr collector for this request
  currentStderr = [];
  currentRequestId = id;
  
  try {
    const instance = await initOpenSCAD();

    // Cleanup old files
    try { instance.FS.unlink("/input.scad"); } catch {}
    try { instance.FS.unlink("/output.stl"); } catch {}
    
    instance.FS.writeFile("/input.scad", code);
    
    // Run OpenSCAD - capture any thrown errors but don't fail yet
    try {
      instance.callMain(["/input.scad", "--enable=manifold", "-o", "/output.stl"]);
    } catch (mainError: any) {
      console.warn('[Worker] callMain threw:', mainError, typeof mainError);
      
      // Emscripten ExitStatus is often just a number or has .status
      const isExitStatus = mainError?.name === 'ExitStatus' || 
                           mainError?.constructor?.name === 'ExitStatus' ||
                           typeof mainError === 'number';
      
      if (isExitStatus) {
        const status = typeof mainError === 'number' ? mainError : mainError?.status;
        console.warn('[Worker] ExitStatus:', status);
        // Don't fail yet - check if output file exists
      } else if (mainError?.message?.includes('memory') || 
                 mainError?.message?.includes('bad_alloc') ||
                 mainError?.message?.includes('abort')) {
        self.postMessage({ type: 'abort', reason: String(mainError?.message || mainError) });
      }
    }

    // SUCCESS IS DETERMINED BY OUTPUT FILE EXISTENCE, NOT EXIT CODE
    let stlBytes: Uint8Array;
    try {
      stlBytes = instance.FS.readFile("/output.stl") as Uint8Array;
    } catch (readErr) {
      // No output file - this is a real failure
      // Format a meaningful error message from stderr or the exception
      let errorMsg = 'No output generated';
      if (currentStderr.length > 0) {
        // Filter out informational lines, keep actual errors
        const errorLines = currentStderr.filter(line => 
          line.includes('ERROR') || 
          line.includes('error') || 
          line.includes('Warning:') ||
          line.includes('syntax error')
        );
        errorMsg = errorLines.length > 0 ? errorLines.join('\n') : currentStderr.slice(-5).join('\n');
      }
      throw new Error(errorMsg);
    }

    // Check file has content
    if (!stlBytes || stlBytes.byteLength === 0) {
      throw new Error('Output file exists but is empty');
    }

    // Parse STL
    const buffer = stlBytes.buffer.slice(stlBytes.byteOffset, stlBytes.byteOffset + stlBytes.byteLength);
    const mesh = parseSTL(buffer as ArrayBuffer);

    if (!mesh.vertices || mesh.vertices.length === 0) {
      throw new Error('Generated STL has no geometry');
    }

    // SUCCESS - even if there were warnings in stderr
    self.postMessage({ 
      type: 'render-result', 
      id, 
      mesh, 
      logs: currentStderr,
      byteLength: stlBytes.byteLength 
    });
    
    // Cleanup
    try { instance.FS.unlink("/input.scad"); } catch {}
    try { instance.FS.unlink("/output.stl"); } catch {}
      
  } catch (error: any) {
    console.error('[Worker] Render error:', error);
    self.postMessage({ 
      type: 'render-error', 
      id, 
      error: error?.message || String(error),
      logs: currentStderr 
    });
  } finally {
    currentRequestId = null;
  }
}

async function validateCode(code: string, id: string) {
  // Reset stderr collector for this request
  currentStderr = [];
  currentRequestId = id;
  
  try {
    const instance = await initOpenSCAD();

    try { instance.FS.unlink("/validate.scad"); } catch {}
    instance.FS.writeFile("/validate.scad", code);
    
    let valid = true;
    try {
      instance.callMain(["/validate.scad", "--preview", "-o", "/dev/null"]);
    } catch (mainError: any) {
      const isExitStatus = mainError?.name === 'ExitStatus' || 
                           mainError?.constructor?.name === 'ExitStatus' ||
                           typeof mainError === 'number';
      if (isExitStatus) {
        const status = typeof mainError === 'number' ? mainError : mainError?.status;
        valid = status === 0;
      } else {
        valid = false;
        currentStderr.push(mainError?.message || String(mainError));
      }
    }

    try { instance.FS.unlink("/validate.scad"); } catch {}

    self.postMessage({
      type: 'validate-result',
      id,
      valid: valid && currentStderr.filter(l => l.includes('ERROR') || l.includes('error')).length === 0,
      errors: currentStderr
    });
  } catch (error) {
    self.postMessage({
      type: 'validate-result',
      id,
      valid: false,
      errors: [error instanceof Error ? error.message : 'Validation failed']
    });
  } finally {
    currentRequestId = null;
  }
}

self.onmessage = (e: MessageEvent<MessageType>) => {
  const data = e.data;

  switch (data.type) {
    case 'init': {
      opQueue = opQueue
        .then(async () => {
          try {
            await initOpenSCAD();
          } catch (error) {
            self.postMessage({ type: 'init-error', error: String(error) });
          }
        })
        .catch(() => {
          // Keep queue alive even if something unexpected happens
        });
      break;
    }
    case 'render': {
      opQueue = opQueue
        .then(() => renderScadToSTL(data.code, data.id))
        .catch((err) => {
          console.error('[Worker] Queued render failed:', err);
        });
      break;
    }
    case 'validate': {
      opQueue = opQueue
        .then(() => validateCode(data.code, data.id))
        .catch((err) => {
          console.error('[Worker] Queued validate failed:', err);
        });
      break;
    }
  }
};
