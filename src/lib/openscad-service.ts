import { STLMesh } from '@/types/openscad';

let worker: Worker | null = null;
let loadingProgress: 'idle' | 'loading' | 'ready' | 'error' = 'idle';

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  logs: string[];
};

const pendingRequests = new Map<string, PendingRequest>();
let requestIdCounter = 0;

export function getLoadingStatus() {
  return loadingProgress;
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./openscad.worker.ts', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
      const { type } = e.data;
      
      switch (type) {
        case 'ready':
          loadingProgress = 'ready';
          break;
        case 'init-error':
          loadingProgress = 'error';
          break;
        case 'log':
          console.log('[OpenSCAD]', e.data.text);
          break;
        case 'error-log':
          console.warn('[OpenSCAD Error]', e.data.text);
          // Add to pending request logs
          for (const req of pendingRequests.values()) {
            req.logs.push(e.data.text);
          }
          break;
        case 'render-result': {
          const req = pendingRequests.get(e.data.id);
          if (req) {
            pendingRequests.delete(e.data.id);
            req.resolve({ mesh: e.data.mesh, logs: e.data.logs });
          }
          break;
        }
        case 'render-error': {
          const req = pendingRequests.get(e.data.id);
          if (req) {
            pendingRequests.delete(e.data.id);
            req.reject(new OpenSCADError(e.data.error, e.data.logs));
          }
          break;
        }
        case 'validate-result': {
          const req = pendingRequests.get(e.data.id);
          if (req) {
            pendingRequests.delete(e.data.id);
            req.resolve({ valid: e.data.valid, errors: e.data.errors });
          }
          break;
        }
      }
    };
    
    worker.onerror = (error) => {
      console.error('[OpenSCAD Worker Error]', error);
      loadingProgress = 'error';
    };
  }
  
  return worker;
}

export class OpenSCADError extends Error {
  logs: string[];
  
  constructor(message: string, logs: string[] = []) {
    super(message);
    this.name = 'OpenSCADError';
    this.logs = logs;
  }
}

export async function renderScadToSTL(code: string): Promise<STLMesh> {
  const w = getWorker();
  const id = `render-${++requestIdCounter}`;
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve: (result) => resolve(result.mesh), reject, logs: [] });
    w.postMessage({ type: 'render', code, id });
  });
}

export async function validateScadCode(code: string): Promise<{ valid: boolean; errors: string[] }> {
  const w = getWorker();
  const id = `validate-${++requestIdCounter}`;
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject, logs: [] });
    w.postMessage({ type: 'validate', code, id });
  });
}

export function preloadOpenSCAD(): void {
  if (loadingProgress === 'idle') {
    loadingProgress = 'loading';
    const w = getWorker();
    w.postMessage({ type: 'init' });
  }
}
