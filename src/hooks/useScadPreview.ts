import { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';

interface ScadPrimitive {
  type: 'cube' | 'sphere' | 'cylinder' | 'cone';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  params: Record<string, number | boolean>;
  color?: string;
  operation?: 'union' | 'difference' | 'intersection';
}

interface ParsedScad {
  primitives: ScadPrimitive[];
  isValid: boolean;
  error?: string;
}

// Simple SCAD code parser - extracts basic primitives
function parseScadCode(code: string): ParsedScad {
  const primitives: ScadPrimitive[] = [];
  
  try {
    // Remove comments
    const cleanCode = code
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    // Extract cube definitions
    const cubeMatches = cleanCode.matchAll(/cube\s*\(\s*\[?\s*([\d.]+)\s*,?\s*([\d.]+)?\s*,?\s*([\d.]+)?\s*\]?\s*(?:,\s*center\s*=\s*(true|false))?\s*\)/g);
    for (const match of cubeMatches) {
      const size = parseFloat(match[1]) || 10;
      const sizeY = parseFloat(match[2]) || size;
      const sizeZ = parseFloat(match[3]) || size;
      const centered = match[4] === 'true';
      
      primitives.push({
        type: 'cube',
        position: centered ? [0, 0, 0] : [size/2, sizeY/2, sizeZ/2],
        rotation: [0, 0, 0],
        scale: [size, sizeY, sizeZ],
        params: { centered },
      });
    }

    // Extract sphere definitions
    const sphereMatches = cleanCode.matchAll(/sphere\s*\(\s*(?:r\s*=\s*)?([\d.]+)(?:\s*,\s*\$fn\s*=\s*(\d+))?\s*\)/g);
    for (const match of sphereMatches) {
      const radius = parseFloat(match[1]) || 5;
      
      primitives.push({
        type: 'sphere',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [radius * 2, radius * 2, radius * 2],
        params: { radius },
      });
    }

    // Extract cylinder definitions
    const cylinderMatches = cleanCode.matchAll(/cylinder\s*\(\s*(?:h\s*=\s*)?([\d.]+)\s*,\s*(?:r\s*=\s*)?([\d.]+)(?:\s*,\s*(?:r2\s*=\s*)?([\d.]+))?(?:\s*,\s*center\s*=\s*(true|false))?(?:\s*,\s*\$fn\s*=\s*(\d+))?\s*\)/g);
    for (const match of cylinderMatches) {
      const height = parseFloat(match[1]) || 10;
      const radius = parseFloat(match[2]) || 5;
      const radius2 = match[3] ? parseFloat(match[3]) : radius;
      const centered = match[4] === 'true';
      
      primitives.push({
        type: radius2 !== radius ? 'cone' : 'cylinder',
        position: centered ? [0, 0, 0] : [0, 0, height/2],
        rotation: [0, 0, 0],
        scale: [radius * 2, height, radius2 * 2],
        params: { height, radius, radius2, centered },
      });
    }

    // Check for difference operation
    if (cleanCode.includes('difference()')) {
      if (primitives.length > 1) {
        primitives[0].operation = 'union';
        for (let i = 1; i < primitives.length; i++) {
          primitives[i].operation = 'difference';
        }
      }
    }

    return { primitives, isValid: true };
  } catch (error) {
    return { 
      primitives: [], 
      isValid: false, 
      error: error instanceof Error ? error.message : 'Parse error' 
    };
  }
}

export function useScadPreview(code: string, debounceMs: number = 500) {
  const [parsedScad, setParsedScad] = useState<ParsedScad>({ primitives: [], isValid: true });
  const [isRendering, setIsRendering] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsRendering(true);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const result = parseScadCode(code);
      setParsedScad(result);
      setIsRendering(false);
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [code, debounceMs]);

  return { parsedScad, isRendering };
}

export type { ScadPrimitive, ParsedScad };
