import { useCallback, useRef } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface ScadEditorProps {
  code: string;
  onChange: (code: string) => void;
  onSelectionChange?: (selectedText: string) => void;
  fontSize?: number;
}

// OpenSCAD language definition
const openscadLanguage = {
  keywords: [
    'module', 'function', 'if', 'else', 'for', 'let', 'each', 'assert', 'echo',
    'include', 'use', 'true', 'false', 'undef',
  ],
  builtins: [
    'cube', 'sphere', 'cylinder', 'polyhedron', 'circle', 'square', 'polygon',
    'linear_extrude', 'rotate_extrude', 'surface', 'import', 'text',
    'union', 'difference', 'intersection', 'hull', 'minkowski',
    'translate', 'rotate', 'scale', 'mirror', 'multmatrix', 'color', 'offset', 'resize',
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'abs', 'ceil', 'floor',
    'round', 'min', 'max', 'pow', 'sqrt', 'exp', 'log', 'ln', 'sign', 'rands', 'norm', 'cross',
    'len', 'concat', 'lookup', 'str', 'chr', 'ord', 'search', 'version', 'version_num',
    'children', 'parent_module',
  ],
  operators: [
    '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
    '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^', '%',
  ],
  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],
      [/[a-z_$][\w$]*/, {
        cases: {
          '@keywords': 'keyword',
          '@builtins': 'type.identifier',
          '@default': 'identifier',
        },
      }],
      [/\$[\w]+/, 'variable'],
      [/[{}()\[\]]/, '@brackets'],
      [/@symbols/, 'operator'],
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/\d+/, 'number'],
      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string'],
    ],
    comment: [
      [/[^\/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[\/*]/, 'comment'],
    ],
    string: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],
  },
};

const openscadTheme: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'c678dd', fontStyle: 'bold' },
    { token: 'type.identifier', foreground: '61afef' },
    { token: 'identifier', foreground: 'e06c75' },
    { token: 'variable', foreground: 'd19a66' },
    { token: 'number', foreground: 'd19a66' },
    { token: 'number.float', foreground: 'd19a66' },
    { token: 'string', foreground: '98c379' },
    { token: 'string.escape', foreground: '56b6c2' },
    { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
    { token: 'operator', foreground: '56b6c2' },
  ],
  colors: {
    'editor.background': '#0d1117',
    'editor.foreground': '#abb2bf',
    'editor.lineHighlightBackground': '#1a1f29',
    'editor.selectionBackground': '#3e4451',
    'editorCursor.foreground': '#528bff',
    'editorLineNumber.foreground': '#495162',
    'editorLineNumber.activeForeground': '#abb2bf',
  },
};

export function ScadEditor({ code, onChange, onSelectionChange, fontSize = 14 }: ScadEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Register OpenSCAD language
    monaco.languages.register({ id: 'openscad' });
    monaco.languages.setMonarchTokensProvider('openscad', openscadLanguage as any);
    monaco.editor.defineTheme('openscad-dark', openscadTheme);
    monaco.editor.setTheme('openscad-dark');

    // Handle selection changes
    editor.onDidChangeCursorSelection((e) => {
      if (onSelectionChange) {
        const selection = editor.getModel()?.getValueInRange(e.selection) || '';
        onSelectionChange(selection);
      }
    });
  }, [onSelectionChange]);

  const handleChange: OnChange = useCallback((value) => {
    onChange(value || '');
  }, [onChange]);

  return (
    <div className="h-full w-full overflow-hidden rounded-lg border border-border bg-editor">
      <Editor
        height="100%"
        defaultLanguage="openscad"
        value={code}
        onChange={handleChange}
        onMount={handleEditorMount}
        theme="openscad-dark"
        options={{
          fontSize,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          padding: { top: 16, bottom: 16 },
          renderLineHighlight: 'line',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
        }}
      />
    </div>
  );
}
