import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import logger from '../../../utils/logger.js';

const SKILLS_DIR = join(process.cwd(), 'data', 'skills');

interface SkillFile {
  id: string;
  name: string;
  description: string;
  trigger: string;
  prompt: string;
  examples: string[];
  version: string;
  createdAt: string;
  updatedAt: string;
  source: string;
}

function loadAllSkills(): SkillFile[] {
  if (!existsSync(SKILLS_DIR)) return [];
  const files = readdirSync(SKILLS_DIR).filter(f => f.endsWith('.json'));
  const skills: SkillFile[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(SKILLS_DIR, file), 'utf-8');
      skills.push(JSON.parse(raw));
    } catch (err) {
      logger.warn(`Failed to load skill file: ${file}`, { error: err });
    }
  }
  return skills;
}

export function setupSkillsRoutes(): Router {
  const router = Router();

  // GET /api/skills — list all skills
  router.get('/', (_req: Request, res: Response) => {
    const skills = loadAllSkills();
    res.json(skills);
  });

  // GET /api/skills/:id — get single skill
  router.get('/:id', (req: Request, res: Response) => {
    const filePath = join(SKILLS_DIR, `${req.params.id}.json`);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    try {
      const raw = readFileSync(filePath, 'utf-8');
      res.json(JSON.parse(raw));
    } catch {
      res.status(500).json({ error: 'Failed to read skill' });
    }
  });

  // POST /api/skills — create new skill
  router.post('/', (req: Request, res: Response) => {
    const { name, description, trigger, prompt, examples } = req.body;
    if (!name || !trigger || !prompt) {
      res.status(400).json({ error: 'name, trigger, and prompt are required' });
      return;
    }

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const skill: SkillFile = {
      id,
      name,
      description: description ?? '',
      trigger,
      prompt,
      examples: examples ?? [],
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'dashboard',
    };

    if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true });
    const filePath = join(SKILLS_DIR, `${id}.json`);
    writeFileSync(filePath, JSON.stringify(skill, null, 2), 'utf-8');
    logger.info(`Skill created via dashboard: ${name}`);
    res.status(201).json(skill);
  });

  // PUT /api/skills/:id — update skill
  router.put('/:id', (req: Request, res: Response) => {
    const filePath = join(SKILLS_DIR, `${req.params.id}.json`);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    try {
      const existing = JSON.parse(readFileSync(filePath, 'utf-8'));
      const updates = req.body;
      const updated = {
        ...existing,
        ...updates,
        id: existing.id, // prevent ID change
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      logger.info(`Skill updated via dashboard: ${existing.name}`);
      res.json(updated);
    } catch {
      res.status(500).json({ error: 'Failed to update skill' });
    }
  });

  // DELETE /api/skills/:id — delete skill
  router.delete('/:id', (req: Request, res: Response) => {
    const filePath = join(SKILLS_DIR, `${req.params.id}.json`);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    try {
      unlinkSync(filePath);
      logger.info(`Skill deleted via dashboard: ${req.params.id}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete skill' });
    }
  });

  return router;
}
