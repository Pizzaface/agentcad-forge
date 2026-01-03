export interface LintError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface LintResult {
  valid: boolean;
  errors: LintError[];
}

// OpenSCAD built-in functions and modules
const BUILTIN_FUNCTIONS = new Set([
  'abs', 'sign', 'sin', 'cos', 'tan', 'acos', 'asin', 'atan', 'atan2',
  'floor', 'round', 'ceil', 'ln', 'log', 'pow', 'sqrt', 'exp',
  'rands', 'min', 'max', 'norm', 'cross', 'len', 'concat', 'lookup',
  'str', 'chr', 'ord', 'search', 'version', 'version_num', 'parent_module',
  'is_undef', 'is_bool', 'is_num', 'is_string', 'is_list', 'is_function',
  'echo', 'assert', 'let',
]);

const BUILTIN_MODULES = new Set([
  'cube', 'sphere', 'cylinder', 'polyhedron', 'circle', 'square', 'polygon',
  'text', 'import', 'surface', 'linear_extrude', 'rotate_extrude',
  'translate', 'rotate', 'scale', 'resize', 'mirror', 'multmatrix',
  'color', 'offset', 'hull', 'minkowski', 'union', 'difference', 'intersection',
  'render', 'children', 'for', 'intersection_for', 'if', 'else',
  'module', 'function', 'include', 'use', 'projection',
]);

/**
 * Lint OpenSCAD code for common errors
 */
export function lintOpenSCAD(code: string): LintResult {
  const errors: LintError[] = [];
  const lines = code.split('\n');

  // Track bracket/brace/paren matching
  const bracketStack: { char: string; line: number; col: number }[] = [];
  const matchingBrackets: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
  };
  const closingBrackets: Record<string, string> = {
    ')': '(',
    ']': '[',
    '}': '{',
  };

  let inBlockComment = false;
  let inString = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    let col = 0;

    while (col < line.length) {
      const char = line[col];
      const nextChar = line[col + 1];

      // Handle block comment start
      if (!inString && char === '/' && nextChar === '*') {
        inBlockComment = true;
        col += 2;
        continue;
      }

      // Handle block comment end
      if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false;
        col += 2;
        continue;
      }

      // Skip if in block comment
      if (inBlockComment) {
        col++;
        continue;
      }

      // Handle line comment
      if (!inString && char === '/' && nextChar === '/') {
        break; // Skip rest of line
      }

      // Handle strings
      if (char === '"' && (col === 0 || line[col - 1] !== '\\')) {
        inString = !inString;
        col++;
        continue;
      }

      // Skip if in string
      if (inString) {
        col++;
        continue;
      }

      // Track brackets
      if (matchingBrackets[char]) {
        bracketStack.push({ char, line: lineNum + 1, col: col + 1 });
      } else if (closingBrackets[char]) {
        const expected = closingBrackets[char];
        const last = bracketStack.pop();
        
        if (!last) {
          errors.push({
            line: lineNum + 1,
            column: col + 1,
            message: `Unexpected closing '${char}' without matching opening bracket`,
            severity: 'error',
          });
        } else if (last.char !== expected) {
          errors.push({
            line: lineNum + 1,
            column: col + 1,
            message: `Mismatched brackets: expected '${matchingBrackets[last.char]}' to close '${last.char}' from line ${last.line}, but found '${char}'`,
            severity: 'error',
          });
        }
      }

      col++;
    }

    // Check for unclosed string on same line
    if (inString) {
      errors.push({
        line: lineNum + 1,
        column: 1,
        message: 'Unclosed string literal',
        severity: 'error',
      });
      inString = false;
    }

    // Check for common syntax issues on non-empty, non-comment lines
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('//')) {
      // Check for missing semicolons (heuristic)
      // Statements that should end with semicolon
      const statementPatterns = [
        /^\s*\w+\s*=\s*.+[^;{}\s]\s*$/,  // variable assignment without semicolon
        /^\s*(cube|sphere|cylinder|circle|square|polygon|text)\s*\([^)]*\)\s*[^;{}\s]*$/,  // primitive without semicolon
      ];
      
      for (const pattern of statementPatterns) {
        if (pattern.test(line) && !line.includes('{')) {
          // Check if next non-empty line starts with an operator (continuation)
          let isContinuation = false;
          for (let nextLine = lineNum + 1; nextLine < lines.length; nextLine++) {
            const next = lines[nextLine].trim();
            if (next) {
              isContinuation = /^[+\-*\/\?:]/.test(next) || next.startsWith('.');
              break;
            }
          }
          
          if (!isContinuation) {
            errors.push({
              line: lineNum + 1,
              column: line.length,
              message: 'Statement may be missing a semicolon',
              severity: 'warning',
            });
          }
        }
      }
    }
  }

  // Report unclosed brackets
  for (const bracket of bracketStack) {
    errors.push({
      line: bracket.line,
      column: bracket.col,
      message: `Unclosed '${bracket.char}' - missing '${matchingBrackets[bracket.char]}'`,
      severity: 'error',
    });
  }

  // Report unclosed block comment
  if (inBlockComment) {
    errors.push({
      line: lines.length,
      column: 1,
      message: 'Unclosed block comment (missing */)',
      severity: 'error',
    });
  }

  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
  };
}

/**
 * Parse OpenSCAD compiler output to extract error information
 */
export function parseOpenSCADErrors(output: string): LintError[] {
  const errors: LintError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match patterns like: "ERROR: Parser error in line 5: syntax error"
    // Or: "WARNING: ..."
    // Or: "ERROR: ... at line 10, column 5"
    
    const errorMatch = line.match(/^(ERROR|WARNING|DEPRECATED):\s*(.+?)(?:\s+in\s+line\s+(\d+))?(?:[:,]\s*(?:column\s+)?(\d+))?/i);
    
    if (errorMatch) {
      const [, severity, message, lineNum, colNum] = errorMatch;
      errors.push({
        line: lineNum ? parseInt(lineNum, 10) : 1,
        column: colNum ? parseInt(colNum, 10) : 1,
        message: message.trim(),
        severity: severity.toUpperCase() === 'ERROR' ? 'error' : 'warning',
      });
      continue;
    }

    // Match: "Parser error: ..." or similar
    const parserErrorMatch = line.match(/Parser error.*?line\s+(\d+)/i);
    if (parserErrorMatch) {
      errors.push({
        line: parseInt(parserErrorMatch[1], 10),
        column: 1,
        message: line.trim(),
        severity: 'error',
      });
    }

    // Match simple error lines that contain useful info
    if (line.includes('ERROR') || line.includes('syntax error')) {
      const lineNumMatch = line.match(/line\s+(\d+)/i);
      if (lineNumMatch && !errors.some(e => e.message === line.trim())) {
        errors.push({
          line: parseInt(lineNumMatch[1], 10),
          column: 1,
          message: line.trim(),
          severity: 'error',
        });
      }
    }
  }

  return errors;
}

/**
 * Format lint errors for display or AI context
 */
export function formatLintErrors(errors: LintError[]): string {
  if (errors.length === 0) return '';
  
  return errors
    .map(e => `Line ${e.line}:${e.column} [${e.severity.toUpperCase()}]: ${e.message}`)
    .join('\n');
}
