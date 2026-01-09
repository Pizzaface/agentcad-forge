import { AIProvider, AIAction, AppSettings } from '@/types/openscad';

const SYSTEM_PROMPTS: Record<AIAction, string> = {
  generate: `You are an expert OpenSCAD programmer. Generate clean, well-commented OpenSCAD code based on the user's description. Use parametric design when appropriate.

Return ONLY the OpenSCAD code, wrapped in a single markdown code block like:
\`\`\`openscad
...code...
\`\`\`
No prose outside the code block.`,

  modify: `You are an expert OpenSCAD programmer. Modify the provided OpenSCAD code according to the user's instructions. Preserve the existing structure where possible. Return ONLY the modified code, no explanations.`,

  explain: `You are an expert OpenSCAD programmer and teacher. Explain the provided OpenSCAD code in plain English. Break down what each section does, explain any mathematical concepts, and describe the resulting 3D shape.`,

  fix: `You are an expert OpenSCAD programmer and debugger. Analyze the provided OpenSCAD code for syntax errors, logical issues, or common mistakes. Fix any problems found.

Return ONLY the corrected OpenSCAD code, wrapped in a single markdown code block like:
\`\`\`openscad
...code...
\`\`\`
No prose outside the code block.`,
};

interface AIRequestConfig {
  provider: AIProvider;
  action: AIAction;
  userMessage: string;
  code?: string;
  selectedText?: string;
  settings: AppSettings;
  onChunk?: (chunk: string) => void;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendAIRequest(config: AIRequestConfig): Promise<string> {
  const { provider, action, userMessage, code, selectedText, settings, onChunk } = config;
  const providerConfig = settings.providers[provider];
  
  if (!providerConfig.apiKey) {
    throw new Error(`No API key configured for ${provider}. Please add your API key in settings.`);
  }
  
  const systemPrompt = SYSTEM_PROMPTS[action];
  let fullMessage = userMessage;
  
  if (action === 'modify' || action === 'explain' || action === 'fix') {
    const codeToUse = selectedText || code;
    if (codeToUse) {
      fullMessage = `${userMessage}\n\nCode:\n\`\`\`openscad\n${codeToUse}\n\`\`\``;
    }
  }
  
  switch (provider) {
    case 'claude': {
      const claudeConfig = providerConfig as { apiKey: string; model: string; thinkingBudget?: number };
      return streamClaudeRequest(claudeConfig.apiKey, claudeConfig.model, systemPrompt, fullMessage, claudeConfig.thinkingBudget ?? 0, onChunk);
    }
    case 'gemini':
      return streamGeminiRequest(providerConfig.apiKey, providerConfig.model, systemPrompt, fullMessage, onChunk);
    case 'openai': {
      const openaiConfig = providerConfig as { apiKey: string; model: string; reasoningEffort?: 'off' | 'low' | 'medium' | 'high' };
      return streamOpenAIRequest(openaiConfig.apiKey, openaiConfig.model, systemPrompt, fullMessage, openaiConfig.reasoningEffort ?? 'off', onChunk);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function streamClaudeRequest(
  apiKey: string, 
  model: string, 
  systemPrompt: string, 
  userMessage: string,
  thinkingBudget: number,
  onChunk?: (chunk: string) => void
): Promise<string> {
  // Build request body with optional extended thinking
  const body: Record<string, unknown> = {
    model,
    max_tokens: thinkingBudget > 0 ? Math.max(16000, thinkingBudget + 4096) : 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }] as ClaudeMessage[],
    stream: true,
  };

  // Add thinking config if enabled (budget_tokens must be >= 1024)
  if (thinkingBudget >= 1024) {
    body.thinking = {
      type: 'enabled',
      budget_tokens: thinkingBudget,
    };
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Claude API request failed');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullText += parsed.delta.text;
            onChunk?.(parsed.delta.text);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  return fullText;
}

async function streamGeminiRequest(
  apiKey: string, 
  model: string, 
  systemPrompt: string, 
  userMessage: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [{
          parts: [{ text: userMessage }],
        }],
        generationConfig: {
          maxOutputTokens: 4096,
        },
      }),
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Gemini API request failed');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullText += text;
            onChunk?.(text);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  return fullText;
}

async function streamOpenAIRequest(
  apiKey: string, 
  model: string, 
  systemPrompt: string, 
  userMessage: string,
  reasoningEffort: 'off' | 'low' | 'medium' | 'high',
  onChunk?: (chunk: string) => void
): Promise<string> {
  // Build request body with optional reasoning effort
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_completion_tokens: 4096,
    stream: true,
  };

  // Add reasoning config if not 'off'
  if (reasoningEffort !== 'off') {
    body.reasoning = { effort: reasoningEffort };
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API request failed');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk?.(content);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  return fullText;
}

export function extractCodeFromResponse(response: string): string {
  // Try to extract code from markdown code blocks (handle CRLF and case-insensitive lang)
  const codeBlockMatch = response.match(/```(?:openscad|scad)?\s*\r?\n([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  // If no code block, check if the response looks like code
  const looksLikeCode =
    response.includes('cube(') ||
    response.includes('cylinder(') ||
    response.includes('sphere(') ||
    response.includes('module ') ||
    response.includes('difference(') ||
    response.includes('union(') ||
    response.includes('translate(') ||
    response.includes('rotate(') ||
    response.includes('scale(');

  return looksLikeCode ? response.trim() : '';
}
