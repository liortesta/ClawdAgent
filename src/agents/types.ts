export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: 'opus' | 'sonnet' | 'haiku' | 'dynamic';
  tools: string[];
  maxTokens: number;
  temperature: number;
}
