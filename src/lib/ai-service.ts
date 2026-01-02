import { AIProvider, AIAction, AppSettings } from '@/types/openscad';

const SYSTEM_PROMPTS: Record<AIAction, string> = {
  generate: `You are an expert OpenSCAD programmer. Generate clean, well-commented OpenSCAD code based on the user's description. Include helpful comments explaining the code structure. Use parametric design when appropriate.`,
  
  modify: `You are an expert OpenSCAD programmer. Modify the provided OpenSCAD code according to the user's instructions. Preserve the existing structure where possible. Return ONLY the modified code, no explanations.`,
  
  explain: `You are an expert OpenSCAD programmer and teacher. Explain the provided OpenSCAD code in plain English. Break down what each section does, explain any mathematical concepts, and describe the resulting 3D shape.`,
  
  fix: `You are an expert OpenSCAD programmer and debugger. Analyze the provided OpenSCAD code for syntax errors, logical issues, or common mistakes. Fix any problems found and return the corrected code with comments explaining what was fixed.`,
};

interface AIRequestConfig {
  provider: AIProvider;
  action: AIAction;
  userMessage: string;
  code?: string;
  selectedText?: string;
  settings: AppSettings;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendAIRequest(config: AIRequestConfig): Promise<string> {
  const { provider, action, userMessage, code, selectedText, settings } = config;
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
    case 'claude':
      return sendClaudeRequest(providerConfig.apiKey, providerConfig.model, systemPrompt, fullMessage);
    case 'gemini':
      return sendGeminiRequest(providerConfig.apiKey, providerConfig.model, systemPrompt, fullMessage);
    case 'openai':
      return sendOpenAIRequest(providerConfig.apiKey, providerConfig.model, systemPrompt, fullMessage);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function sendClaudeRequest(
  apiKey: string, 
  model: string, 
  systemPrompt: string, 
  userMessage: string
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }] as ClaudeMessage[],
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Claude API request failed');
  }
  
  const data = await response.json();
  return data.content[0].text;
}

async function sendGeminiRequest(
  apiKey: string, 
  model: string, 
  systemPrompt: string, 
  userMessage: string
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
  
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

async function sendOpenAIRequest(
  apiKey: string, 
  model: string, 
  systemPrompt: string, 
  userMessage: string
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 4096,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API request failed');
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}

export function extractCodeFromResponse(response: string): string {
  // Try to extract code from markdown code blocks
  const codeBlockMatch = response.match(/```(?:openscad|scad)?\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  
  // If no code block, check if the response looks like code
  if (response.includes('cube(') || response.includes('cylinder(') || 
      response.includes('sphere(') || response.includes('module ') ||
      response.includes('difference(') || response.includes('union(')) {
    return response.trim();
  }
  
  return response;
}
