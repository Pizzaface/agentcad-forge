import { useState, useEffect, useRef, useCallback } from 'react';
import { renderScadToSTL, validateScadCode, preloadOpenSCAD, getLoadingStatus, OpenSCADError } from '@/lib/openscad-service';
import { lintOpenSCAD, parseOpenSCADErrors, formatLintErrors, LintError } from '@/lib/openscad-linter';
import { STLMesh } from '@/types/openscad';

interface UseOpenScadResult {
  mesh: STLMesh | null;
  isRendering: boolean;
  isLoading: boolean;
  error: string | null;
  lintErrors: LintError[];
  logs: string[];
  render: (code: string) => void;
  forceRender: (code: string) => void;
  validate: (code: string) => Promise<{ valid: boolean; errors: string[] }>;
}

export function useOpenScad(autoRender: boolean = true, debounceMs: number = 1000): UseOpenScadResult {
  const [mesh, setMesh] = useState<STLMesh | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lintErrors, setLintErrors] = useState<LintError[]>([]);
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

  // Quick validation using OpenSCAD preview mode
  const validate = useCallback(async (code: string): Promise<{ valid: boolean; errors: string[] }> => {
    if (!code.trim()) {
      return { valid: true, errors: [] };
    }

    // Run static linter first
    const lintResult = lintOpenSCAD(code);
    const lintErrorMessages = lintResult.errors
      .filter(e => e.severity === 'error')
      .map(e => `Line ${e.line}: ${e.message}`);

    if (lintErrorMessages.length > 0) {
      return { valid: false, errors: lintErrorMessages };
    }

    // Run OpenSCAD validation (preview mode - faster)
    const validationResult = await validateScadCode(code);
    return validationResult;
  }, []);

  const render = useCallback(async (code: string) => {
    if (!code.trim()) {
      setMesh(null);
      setError(null);
      setLintErrors([]);
      return;
    }

    // Run linter first for quick feedback
    const lintResult = lintOpenSCAD(code);
    setLintErrors(lintResult.errors);

    // If there are critical lint errors, don't try to render
    const hasLintErrors = lintResult.errors.some(e => e.severity === 'error');
    if (hasLintErrors) {
      setError(formatLintErrors(lintResult.errors.filter(e => e.severity === 'error')));
      setMesh(null);
      setIsRendering(false);
      return;
    }

    setIsRendering(true);
    setError(null);

    try {
      const mesh = await renderScadToSTL(code);
      setMesh(mesh);
      setError(null);
      setLintErrors([]);
      setLogs([]);
    } catch (err) {
      console.error('[useOpenScad] Render error:', err);
      if (err instanceof OpenSCADError) {
        setError(err.message);
        setLogs(err.logs);
        // Parse OpenSCAD errors and add to lint errors
        if (err.logs.length > 0) {
          const compilerErrors = parseOpenSCADErrors(err.logs.join('\n'));
          setLintErrors(prev => [...prev, ...compilerErrors]);
        }
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
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
    lintErrors,
    logs,
    render: autoRender ? debouncedRender : render,
    forceRender: render,
    validate,
  };
}
