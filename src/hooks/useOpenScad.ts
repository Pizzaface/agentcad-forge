import { useState, useEffect, useRef, useCallback } from 'react';
import { renderScadToSTL, preloadOpenSCAD, getLoadingStatus, RenderResult } from '@/lib/openscad-service';
import { STLMesh } from '@/types/openscad';

interface UseOpenScadResult {
  mesh: STLMesh | null;
  isRendering: boolean;
  isLoading: boolean;
  error: string | null;
  logs: string[];
  render: (code: string) => void;
}

export function useOpenScad(autoRender: boolean = true, debounceMs: number = 1000): UseOpenScadResult {
  const [mesh, setMesh] = useState<STLMesh | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCodeRef = useRef<string>('');

  // Preload OpenSCAD on mount
  useEffect(() => {
    const status = getLoadingStatus();
    if (status === 'idle') {
      setIsLoading(true);
      preloadOpenSCAD();
    }
  }, []);

  // Update loading state based on service status
  useEffect(() => {
    const checkStatus = () => {
      const status = getLoadingStatus();
      setIsLoading(status === 'loading');
    };
    
    // Check periodically until loaded
    const interval = setInterval(() => {
      const status = getLoadingStatus();
      if (status !== 'loading') {
        clearInterval(interval);
        setIsLoading(false);
      }
    }, 100);
    
    checkStatus();
    return () => clearInterval(interval);
  }, []);

  const render = useCallback(async (code: string) => {
    if (!code.trim()) {
      setMesh(null);
      setError(null);
      return;
    }

    setIsRendering(true);
    setError(null);

    try {
      const result: RenderResult = await renderScadToSTL(code);
      
      if (result.success && result.mesh) {
        setMesh(result.mesh);
        setError(null);
      } else {
        setError(result.error || 'Rendering failed');
      }
      
      if (result.logs) {
        setLogs(result.logs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsRendering(false);
    }
  }, []);

  const debouncedRender = useCallback((code: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Skip if code hasn't changed
    if (code === lastCodeRef.current) {
      return;
    }
    lastCodeRef.current = code;

    setIsRendering(true);
    
    timeoutRef.current = setTimeout(() => {
      render(code);
    }, debounceMs);
  }, [render, debounceMs]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    mesh,
    isRendering,
    isLoading,
    error,
    logs,
    render: autoRender ? debouncedRender : render,
  };
}
