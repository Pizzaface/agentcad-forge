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
      self.postMessage({ type: 'error-log', text });
    },
  }).then((instance) => {
    openscadRaw = instance.getInstance();
    self.postMessage({ type: 'ready' });
    return openscadRaw;
  });

  return initPromise;
}

async function renderScadToSTL(code: string, id: string) {
  const logs: string[] = [];
  
  try {
    const instance = await initOpenSCAD();
    
    const originalPrintErr = instance.printErr;
    instance.printErr = (text: string) => {
      logs.push(text);
      self.postMessage({ type: 'error-log', text });
    };

    try {
      instance.FS.writeFile("/input.scad", code);
      
      let exitCode: number;
      try {
        exitCode = instance.callMain(["/input.scad", "--enable=manifold", "-o", "/output.stl"]);
      } catch (mainError) {
        exitCode = typeof mainError === 'number' ? mainError : 1;
      }

      if (exitCode !== 0) {
        throw new Error(logs.length > 0 ? logs.join('\n') : `OpenSCAD exited with code ${exitCode}`);
      }

      let stlContent: string;
      try {
        stlContent = instance.FS.readFile("/output.stl", { encoding: "utf8" }) as string;
      } catch {
        throw new Error(logs.length > 0 ? logs.join('\n') : 'No output generated.');
      }

      if (!stlContent || stlContent.trim().length < 50) {
        throw new Error('No geometry generated.');
      }

      const encoder = new TextEncoder();
      const buffer = encoder.encode(stlContent).buffer;
      const mesh = parseSTL(buffer);

      if (!mesh.vertices || mesh.vertices.length === 0) {
        throw new Error('Generated STL has no geometry.');
      }

      self.postMessage({ type: 'render-result', id, mesh, logs });
    } finally {
      if (originalPrintErr) instance.printErr = originalPrintErr;
      try { instance.FS.unlink("/input.scad"); } catch {}
      try { instance.FS.unlink("/output.stl"); } catch {}
    }
  } catch (error) {
    self.postMessage({ 
      type: 'render-error', 
      id, 
      error: error instanceof Error ? error.message : 'Unknown error',
      logs 
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
    
    let exitCode: number;
    try {
      exitCode = instance.callMain(["/validate.scad", "--preview", "-o", "/dev/null"]);
    } catch (mainError) {
      exitCode = typeof mainError === 'number' ? mainError : 1;
    } finally {
      if (originalPrintErr) instance.printErr = originalPrintErr;
    }

    try { instance.FS.unlink("/validate.scad"); } catch {}

    self.postMessage({
      type: 'validate-result',
      id,
      valid: exitCode === 0 && errors.length === 0,
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
