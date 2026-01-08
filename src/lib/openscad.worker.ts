import { createOpenSCAD } from 'openscad-wasm';
import type { OpenSCAD } from 'openscad-wasm';
import { parseSTL } from './stl-parser';

let openscadRaw: OpenSCAD | null = null;
let initPromise: Promise<OpenSCAD> | null = null;

type MessageType = 
  | { type: 'init' }
  | { type: 'render'; code: string; id: string }
  | { type: 'validate'; code: string; id: string };

async function initOpenSCAD(): Promise<OpenSCAD> {
  if (openscadRaw) return openscadRaw;
  if (initPromise) return initPromise;

  initPromise = createOpenSCAD({
    noInitialRun: true,
    print: (text: string) => {
      self.postMessage({ type: 'log', text });
    },
    printErr: (text: string) => {
      // Don't treat stderr as fatal - OpenSCAD prints status info there
      self.postMessage({ type: 'stderr', text });
    },
  }).then((instance) => {
    openscadRaw = instance.getInstance();
    self.postMessage({ type: 'ready' });
    return openscadRaw;
  });

  return initPromise;
}

async function renderScadToSTL(code: string, id: string) {
  const stderrLogs: string[] = [];
  
  try {
    const instance = await initOpenSCAD();
    
    // Capture stderr for this render
    const originalPrintErr = instance.printErr;
    instance.printErr = (text: string) => {
      stderrLogs.push(text);
      self.postMessage({ type: 'stderr', text });
    };

    try {
      // Cleanup old files
      try { instance.FS.unlink("/input.scad"); } catch {}
      try { instance.FS.unlink("/output.stl"); } catch {}
      
      instance.FS.writeFile("/input.scad", code);
      
      // Run OpenSCAD - capture any thrown errors but don't fail yet
      let thrownError: any = null;
      try {
        instance.callMain(["/input.scad", "--enable=manifold", "-o", "/output.stl"]);
      } catch (mainError: any) {
        console.warn('[Worker] callMain threw:', mainError);
        thrownError = mainError;
        
        // Check if it's an abort (memory/CGAL issue)
        if (mainError?.message?.includes('memory') || 
            mainError?.message?.includes('bad_alloc') ||
            mainError?.message?.includes('abort')) {
          self.postMessage({ type: 'abort', reason: String(mainError) });
        }
      }

      // SUCCESS IS DETERMINED BY OUTPUT FILE EXISTENCE, NOT EXIT CODE
      let stlBytes: Uint8Array;
      try {
        stlBytes = instance.FS.readFile("/output.stl") as Uint8Array;
      } catch (readErr) {
        // No output file - this is a real failure
        const errorMsg = thrownError 
          ? String(thrownError?.message || thrownError)
          : (stderrLogs.length > 0 ? stderrLogs.join('\n') : 'No output generated');
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
        logs: stderrLogs,
        byteLength: stlBytes.byteLength 
      });
      
    } finally {
      if (originalPrintErr) instance.printErr = originalPrintErr;
      try { instance.FS.unlink("/input.scad"); } catch {}
      try { instance.FS.unlink("/output.stl"); } catch {}
    }
  } catch (error: any) {
    console.error('[Worker] Render error:', error);
    self.postMessage({ 
      type: 'render-error', 
      id, 
      error: error?.message || String(error),
      logs: stderrLogs 
    });
  }
}

async function validateCode(code: string, id: string) {
  const errors: string[] = [];
  
  try {
    const instance = await initOpenSCAD();
    
    const originalPrintErr = instance.printErr;
    instance.printErr = (text: string) => {
      errors.push(text);
    };

    instance.FS.writeFile("/validate.scad", code);
    
    let valid = true;
    try {
      instance.callMain(["/validate.scad", "--preview", "-o", "/dev/null"]);
    } catch (mainError: any) {
      if (mainError?.name === 'ExitStatus' || mainError?.constructor?.name === 'ExitStatus') {
        valid = mainError.status === 0;
      } else {
        valid = false;
        errors.push(mainError?.message || String(mainError));
      }
    } finally {
      if (originalPrintErr) instance.printErr = originalPrintErr;
    }

    try { instance.FS.unlink("/validate.scad"); } catch {}

    self.postMessage({
      type: 'validate-result',
      id,
      valid: valid && errors.length === 0,
      errors
    });
  } catch (error) {
    self.postMessage({
      type: 'validate-result',
      id,
      valid: false,
      errors: [error instanceof Error ? error.message : 'Validation failed']
    });
  }
}

self.onmessage = async (e: MessageEvent<MessageType>) => {
  const { type } = e.data;
  
  switch (type) {
    case 'init':
      try {
        await initOpenSCAD();
      } catch (error) {
        self.postMessage({ type: 'init-error', error: String(error) });
      }
      break;
    case 'render':
      await renderScadToSTL(e.data.code, e.data.id);
      break;
    case 'validate':
      await validateCode(e.data.code, e.data.id);
      break;
  }
};
