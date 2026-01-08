import { createOpenSCAD, OpenSCADInstance } from 'openscad-wasm';
import { parseSTL } from './stl-parser';

let openscadInstance: OpenSCADInstance | null = null;
let initPromise: Promise<OpenSCADInstance> | null = null;

type MessageType = 
  | { type: 'init' }
  | { type: 'render'; code: string; id: string }
  | { type: 'validate'; code: string; id: string };

async function initOpenSCAD(): Promise<OpenSCADInstance> {
  if (openscadInstance) return openscadInstance;
  if (initPromise) return initPromise;

  initPromise = createOpenSCAD({
    noInitialRun: true,
    print: (text) => {
      self.postMessage({ type: 'log', text });
    },
    printErr: (text) => {
      self.postMessage({ type: 'error-log', text });
    },
  }).then((instance) => {
    openscadInstance = instance;
    self.postMessage({ type: 'ready' });
    return instance;
  });

  return initPromise;
}

async function renderScadToSTL(code: string, id: string) {
  const logs: string[] = [];
  
  try {
    const instance = await initOpenSCAD();
    const rawInstance = instance.getInstance();
    
    const originalPrintErr = rawInstance.printErr;
    rawInstance.printErr = (text: string) => {
      logs.push(text);
      self.postMessage({ type: 'error-log', text });
    };

    try {
      rawInstance.FS.writeFile("/input.scad", code);
      
      let exitCode: number;
      try {
        exitCode = rawInstance.callMain(["/input.scad", "-o", "/output.stl"]);
      } catch (mainError) {
        exitCode = typeof mainError === 'number' ? mainError : 1;
      }

      if (exitCode !== 0) {
        throw new Error(logs.length > 0 ? logs.join('\n') : `OpenSCAD exited with code ${exitCode}`);
      }

      let stlContent: string;
      try {
        stlContent = rawInstance.FS.readFile("/output.stl", { encoding: "utf8" }) as string;
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
      if (originalPrintErr) rawInstance.printErr = originalPrintErr;
      try { rawInstance.FS.unlink("/input.scad"); } catch {}
      try { rawInstance.FS.unlink("/output.stl"); } catch {}
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
    const rawInstance = instance.getInstance();
    
    const originalPrintErr = rawInstance.printErr;
    rawInstance.printErr = (text: string) => {
      errors.push(text);
    };

    rawInstance.FS.writeFile("/validate.scad", code);
    
    let exitCode: number;
    try {
      exitCode = rawInstance.callMain(["/validate.scad", "--preview", "-o", "/dev/null"]);
    } catch (mainError) {
      exitCode = typeof mainError === 'number' ? mainError : 1;
    } finally {
      if (originalPrintErr) rawInstance.printErr = originalPrintErr;
    }

    try { rawInstance.FS.unlink("/validate.scad"); } catch {}

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
