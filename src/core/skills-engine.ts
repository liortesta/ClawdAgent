import { promises as fs } from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

export interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: string;  // regex pattern that activates this skill
  prompt: string;   // system prompt fragment for this skill
  examples: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  source: 'built-in' | 'learned' | 'user-created';
}

const SKILLS_DIR = path.resolve('data/skills');

// Built-in skills that are always available
const BUILT_IN_SKILLS: Skill[] = [
  {
    id: 'summarize',
    name: 'Summarize',
    description: 'Summarize long text, articles, or conversations',
    trigger: '(summarize|summary|tldr|tl;dr|סכם|תקציר)',
    prompt: 'You are an expert summarizer. Extract key points concisely. Use bullet points. Keep the summary under 30% of the original length.',
    examples: ['Summarize this article', 'Give me a TLDR', 'סכם את השיחה'],
    version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'built-in',
  },
  {
    id: 'translate',
    name: 'Translate',
    description: 'Translate text between languages',
    trigger: '(translate|תרגם|translation|תרגום)',
    prompt: 'You are a professional translator. Translate accurately while preserving tone and idioms. If the source language is not specified, auto-detect it.',
    examples: ['Translate this to Hebrew', 'תרגם לאנגלית', 'Translate to Spanish'],
    version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'built-in',
  },
  {
    id: 'explain-code',
    name: 'Explain Code',
    description: 'Explain code in simple terms',
    trigger: '(explain|הסבר).*(code|קוד|function|פונקציה)',
    prompt: 'Explain the code step by step in simple terms. Use analogies where helpful. Point out any potential issues or improvements.',
    examples: ['Explain this code', 'הסבר את הקוד הזה', 'What does this function do?'],
    version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'built-in',
  },
  {
    id: 'debug',
    name: 'Debug',
    description: 'Debug errors and fix issues',
    trigger: '(debug|error|bug|fix|שגיאה|באג|תקן)',
    prompt: 'You are a debugging expert. Analyze the error systematically: 1) Identify the root cause, 2) Explain why it happened, 3) Provide the fix, 4) Suggest how to prevent it in the future.',
    examples: ['Debug this error', 'Fix this bug', 'תקן את השגיאה'],
    version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'built-in',
  },
  {
    id: 'write-email',
    name: 'Write Email',
    description: 'Compose professional emails',
    trigger: '(write|compose|draft).*(email|mail|אימייל|מייל)',
    prompt: 'Write a professional, clear email. Match the tone to the context (formal/informal). Include subject line, greeting, body, and sign-off.',
    examples: ['Write an email to my boss', 'Draft a follow-up email', 'כתוב מייל'],
    version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'built-in',
  },
];

export class SkillsEngine {
  private skills: Map<string, Skill> = new Map();
  private initialized = false;

  async init() {
    // Load built-in skills
    for (const skill of BUILT_IN_SKILLS) {
      this.skills.set(skill.id, skill);
    }

    // Load learned/user-created skills from disk
    await this.loadFromDisk();
    this.initialized = true;
    logger.info(`🎯 Skills engine initialized: ${this.skills.size} skills loaded`);
  }

  private async loadFromDisk() {
    try {
      await fs.mkdir(SKILLS_DIR, { recursive: true });
      const files = await fs.readdir(SKILLS_DIR);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = await fs.readFile(path.join(SKILLS_DIR, file), 'utf-8');
          const skill: Skill = JSON.parse(content);
          this.skills.set(skill.id, skill);
        } catch (err: any) {
          logger.warn(`Failed to load skill file: ${file}`, { error: err.message });
        }
      }
    } catch (err: any) {
      logger.debug('Skills directory not found, will create on first save', { error: err.message });
    }
  }

  async saveSkill(skill: Skill): Promise<void> {
    this.skills.set(skill.id, skill);
    await fs.mkdir(SKILLS_DIR, { recursive: true });
    await fs.writeFile(
      path.join(SKILLS_DIR, `${skill.id}.json`),
      JSON.stringify(skill, null, 2),
      'utf-8'
    );
    logger.info(`Skill saved: ${skill.id}`, { name: skill.name, source: skill.source });
  }

  async createSkill(params: {
    name: string;
    description: string;
    trigger: string;
    prompt: string;
    examples?: string[];
    source?: 'learned' | 'user-created';
  }): Promise<Skill> {
    const id = params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const now = new Date().toISOString();
    const skill: Skill = {
      id,
      name: params.name,
      description: params.description,
      trigger: params.trigger,
      prompt: params.prompt,
      examples: params.examples ?? [],
      version: 1,
      createdAt: now,
      updatedAt: now,
      source: params.source ?? 'learned',
    };
    await this.saveSkill(skill);
    return skill;
  }

  async deleteSkill(id: string): Promise<boolean> {
    const skill = this.skills.get(id);
    if (!skill || skill.source === 'built-in') return false;

    this.skills.delete(id);
    try {
      await fs.unlink(path.join(SKILLS_DIR, `${id}.json`));
    } catch { /* file may not exist */ }
    return true;
  }

  /**
   * Find the best matching skill for a user message
   */
  matchSkill(message: string): Skill | null {
    const lower = message.toLowerCase();
    for (const skill of this.skills.values()) {
      try {
        const regex = new RegExp(skill.trigger, 'i');
        if (regex.test(lower)) return skill;
      } catch {
        // Invalid regex — skip
      }
    }
    return null;
  }

  /**
   * Get a summary of all skills for injection into context
   */
  getSkillsSummary(): string {
    const skills = Array.from(this.skills.values());
    if (skills.length === 0) return '';
    return skills
      .map(s => `- **${s.name}**: ${s.description} (trigger: \`${s.trigger}\`)`)
      .join('\n');
  }

  getSkill(id: string): Skill | undefined { return this.skills.get(id); }
  getAllSkills(): Skill[] { return Array.from(this.skills.values()); }
  getSkillCount(): number { return this.skills.size; }
}
