import { AIClient } from './ai-client.js';
import { SkillFetcher } from './skill-fetcher.js';
import { AgentFactory } from './agent-factory.js';
import { CapabilityLearner } from './capability-learner.js';
import { CrewOrchestrator } from './crew-orchestrator.js';
import { MetaAgent } from './meta-agent.js';
import { SelfRepair } from './self-repair.js';
import { SkillsEngine } from './skills-engine.js';
import { IntelligenceScorer } from './intelligence-scorer.js';
import { MemoryHierarchy } from './memory-hierarchy.js';
import { GovernanceEngine } from './governance-engine.js';
import { CostIntelligence } from './cost-intelligence.js';
import { AdaptiveModelRouter } from './adaptive-model-router.js';
import { ObservabilityLayer } from './observability.js';
import { AutonomousGoalEngine } from './autonomous-goals.js';
import { SafetySimulator } from './safety-simulator.js';
import { FeedbackLoop } from './feedback-loop.js';
import { getAllAgents } from '../agents/registry.js';
import config from '../config.js';
import logger from '../utils/logger.js';

type EvolutionPhase = 'idle' | 'gather' | 'analyze' | 'plan' | 'execute' | 'validate';

interface EvolutionCycleResult {
  phase: EvolutionPhase;
  skillsFetched: number;
  skillsInstalled: number;
  agentsCreated: number;
  capabilitiesLearned: number;
  selfHealAttempts: number;
  errors: string[];
  duration: number;
}

interface EvolutionStatus {
  phase: EvolutionPhase;
  lastCycleAt: number | null;
  totalCycles: number;
  totalSkillsInstalled: number;
  totalAgentsCreated: number;
  consecutiveFailures: number;
  history: EvolutionCycleResult[];
}

const MAX_HISTORY = 20;
const CIRCUIT_BREAKER_THRESHOLD = 3;

export class EvolutionEngine {
  private ai: AIClient;
  private skillFetcher: SkillFetcher;
  private agentFactory: AgentFactory;
  private capabilityLearner: CapabilityLearner;
  private crewOrchestrator: CrewOrchestrator;
  private metaAgent: MetaAgent;
  private selfRepair: SelfRepair;
  private skills: SkillsEngine;

  // Intelligence layer (9 subsystems)
  private scorer: IntelligenceScorer;
  private memory: MemoryHierarchy;
  private governance: GovernanceEngine;
  private costIntel: CostIntelligence;
  private adaptiveRouter: AdaptiveModelRouter;
  private observability: ObservabilityLayer;
  private goalEngine: AutonomousGoalEngine;
  private safetySimulator: SafetySimulator;
  private feedbackLoop: FeedbackLoop;

  private phase: EvolutionPhase = 'idle';
  private mutex = false;
  private consecutiveFailures = 0;
  private totalCycles = 0;
  private totalSkillsInstalled = 0;
  private totalAgentsCreated = 0;
  private lastCycleAt: number | null = null;
  private history: EvolutionCycleResult[] = [];

  constructor(deps: {
    ai: AIClient;
    skillFetcher: SkillFetcher;
    agentFactory: AgentFactory;
    capabilityLearner: CapabilityLearner;
    crewOrchestrator: CrewOrchestrator;
    metaAgent: MetaAgent;
    selfRepair: SelfRepair;
    skills: SkillsEngine;
  }) {
    this.ai = deps.ai;
    this.skillFetcher = deps.skillFetcher;
    this.agentFactory = deps.agentFactory;
    this.capabilityLearner = deps.capabilityLearner;
    this.crewOrchestrator = deps.crewOrchestrator;
    this.metaAgent = deps.metaAgent;
    this.selfRepair = deps.selfRepair;
    this.skills = deps.skills;

    // Initialize 9 intelligence subsystems
    this.scorer = new IntelligenceScorer();
    this.memory = new MemoryHierarchy();
    this.governance = new GovernanceEngine();
    this.costIntel = new CostIntelligence();
    this.adaptiveRouter = new AdaptiveModelRouter();
    this.observability = new ObservabilityLayer();
    this.goalEngine = new AutonomousGoalEngine();
    this.safetySimulator = new SafetySimulator(this.governance);
    this.feedbackLoop = new FeedbackLoop();

    logger.info('Evolution intelligence subsystems initialized', {
      scorer: true, memory: true, governance: true, costIntel: true,
      adaptiveRouter: true, observability: true, goalEngine: true,
      safetySimulator: true, feedbackLoop: true,
    });
  }

  /** Full evolution cycle: Gather → Analyze → Plan → Execute → Validate */
  async evolve(full = false): Promise<EvolutionCycleResult> {
    // Mutex: only one cycle at a time
    if (this.mutex) {
      return this.makeResult('idle', { errors: ['Evolution already running'] });
    }

    // Circuit breaker
    if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      logger.warn('Evolution circuit breaker open', { failures: this.consecutiveFailures });
      return this.makeResult('idle', { errors: ['Circuit breaker: too many consecutive failures'] });
    }

    this.mutex = true;
    const start = Date.now();
    const result: EvolutionCycleResult = {
      phase: 'idle', skillsFetched: 0, skillsInstalled: 0,
      agentsCreated: 0, capabilitiesLearned: 0, selfHealAttempts: 0,
      errors: [], duration: 0,
    };

    try {
      // GATHER — fetch skills from configured sources
      this.phase = 'gather';
      result.phase = 'gather';
      logger.info('Evolution: GATHER phase');

      if (full) {
        const sources = this.getUpgradeSources();
        if (sources.length > 0) {
          const fetchResult = await this.skillFetcher.fetchAll(sources);
          result.skillsFetched = fetchResult.fetched;
          result.skillsInstalled = fetchResult.installed;
          this.totalSkillsInstalled += fetchResult.installed;
          result.errors.push(...fetchResult.errors);
        }
      }

      // ANALYZE — check current state
      this.phase = 'analyze';
      result.phase = 'analyze';
      logger.info('Evolution: ANALYZE phase');

      const currentAgents = getAllAgents();
      const currentSkills = this.skills.getAllSkills();
      const dynamicAgents = this.agentFactory.getDynamicAgentIds();

      // PLAN — decide what to create/improve
      this.phase = 'plan';
      result.phase = 'plan';
      logger.info('Evolution: PLAN phase');

      const planResponse = await this.ai.chat({
        systemPrompt: `You are ClawdAgent's Evolution Engine. Analyze the current system state and suggest improvements.
Current state:
- Agents: ${currentAgents.length} (${dynamicAgents.length} dynamic)
- Skills: ${currentSkills.length}
- Server profiles: ${this.capabilityLearner.getAllProfiles().length}

Respond with JSON: {"needsNewAgent": false, "agentTask": "", "needsSkillUpdate": false, "observations": ""}
Keep recommendations conservative — only suggest changes that clearly improve the system.`,
        messages: [{ role: 'user', content: `Agent IDs: ${currentAgents.map(a => a.id).join(', ')}\nSkill IDs: ${currentSkills.map(s => s.id).join(', ')}` }],
        maxTokens: 300, temperature: 0.2,
      });

      // EXECUTE — apply improvements
      this.phase = 'execute';
      result.phase = 'execute';
      logger.info('Evolution: EXECUTE phase');

      try {
        const plan = JSON.parse(planResponse.content);
        if (plan.needsNewAgent && plan.agentTask) {
          const agent = await this.agentFactory.createFromNeed(plan.agentTask);
          if (agent) {
            result.agentsCreated++;
            this.totalAgentsCreated++;
          }
        }
      } catch {
        // Non-critical: plan parsing failed
      }

      // VALIDATE — check system health
      this.phase = 'validate';
      result.phase = 'validate';
      logger.info('Evolution: VALIDATE phase');

      // Meta-agent reflection on the evolution cycle
      await this.metaAgent.reflect(
        `Evolution cycle completed: ${result.skillsInstalled} skills, ${result.agentsCreated} agents`,
        `System now has ${getAllAgents().length} agents, ${this.skills.getSkillCount()} skills`,
        false,
      ).catch(() => {});

      // Success — reset circuit breaker
      this.consecutiveFailures = 0;
      this.totalCycles++;
      this.lastCycleAt = Date.now();

    } catch (err: any) {
      this.consecutiveFailures++;
      result.errors.push(err.message);
      logger.error('Evolution cycle failed', { error: err.message, failures: this.consecutiveFailures });
    } finally {
      this.phase = 'idle';
      result.duration = Date.now() - start;
      this.mutex = false;

      // Store in history
      this.history.push(result);
      if (this.history.length > MAX_HISTORY) this.history.shift();
    }

    logger.info('Evolution cycle complete', {
      duration: result.duration,
      skills: result.skillsInstalled,
      agents: result.agentsCreated,
      errors: result.errors.length,
    });

    return result;
  }

  /** Self-heal: triggered when an error occurs during normal operation */
  async selfHeal(error: Error, context: string): Promise<boolean> {
    logger.info('Self-heal triggered', { error: error.message, context: context.slice(0, 200) });

    try {
      // Step 1: Try SelfRepair diagnosis
      this.selfRepair.trackError('engine', error.message);
      const repairResult = await this.selfRepair.diagnoseAndRepair();
      if (repairResult.repaired.length > 0) {
        logger.info('Self-heal: repair applied', { repaired: repairResult.repaired });
        return true;
      }

      // Step 2: Meta-agent analysis
      const thought = await this.metaAgent.think(
        `System error occurred: ${error.message}\nContext: ${context}`,
        '',
      );

      if (thought.plan && thought.plan.length > 0) {
        logger.info('Self-heal: meta-agent plan', { steps: thought.plan.length });

        // Step 3: If meta-agent suggests creating a new agent, do it
        if (thought.plan.some((s: string) => s.includes('agent') || s.includes('specialist'))) {
          const agent = await this.agentFactory.createFromNeed(
            `Fix this problem: ${error.message}. Context: ${context.slice(0, 500)}`
          );
          if (agent) {
            logger.info('Self-heal: created fix agent', { id: agent.id });
            return true;
          }
        }
      }

      return false;
    } catch (err: any) {
      logger.warn('Self-heal failed', { error: err.message });
      return false;
    }
  }

  /** Get current evolution status */
  getStatus(): EvolutionStatus {
    return {
      phase: this.phase,
      lastCycleAt: this.lastCycleAt,
      totalCycles: this.totalCycles,
      totalSkillsInstalled: this.totalSkillsInstalled,
      totalAgentsCreated: this.totalAgentsCreated,
      consecutiveFailures: this.consecutiveFailures,
      history: this.history.slice(-5),
    };
  }

  /** Get sub-engine references */
  getSkillFetcher(): SkillFetcher { return this.skillFetcher; }
  getAgentFactory(): AgentFactory { return this.agentFactory; }
  getCapabilityLearner(): CapabilityLearner { return this.capabilityLearner; }
  getCrewOrchestrator(): CrewOrchestrator { return this.crewOrchestrator; }

  /** Intelligence subsystem getters */
  getScorer(): IntelligenceScorer { return this.scorer; }
  getMemoryHierarchy(): MemoryHierarchy { return this.memory; }
  getGovernance(): GovernanceEngine { return this.governance; }
  getCostIntelligence(): CostIntelligence { return this.costIntel; }
  getAdaptiveRouter(): AdaptiveModelRouter { return this.adaptiveRouter; }
  getObservability(): ObservabilityLayer { return this.observability; }
  getAutonomousGoals(): AutonomousGoalEngine { return this.goalEngine; }
  getSafetySimulator(): SafetySimulator { return this.safetySimulator; }
  getFeedbackLoop(): FeedbackLoop { return this.feedbackLoop; }

  /** Get System Health Index (0-100) */
  getHealthIndex(): { score: number; details: ReturnType<ObservabilityLayer['getHealthIndicators']> } {
    const details = this.observability.getHealthIndicators();
    return { score: details.overallScore, details };
  }

  /** Take a system snapshot (call periodically) */
  takeSnapshot(): void {
    this.observability.takeSnapshot({
      activeAgents: getAllAgents().length,
      dynamicAgents: this.agentFactory.getDynamicAgentIds().length,
      totalSkills: this.skills.getSkillCount(),
      evolutionPhase: this.phase,
      costToday: this.costIntel.getReport().totalCost,
    });
  }

  /** Reset circuit breaker */
  resetCircuitBreaker(): void {
    this.consecutiveFailures = 0;
    logger.info('Evolution circuit breaker reset');
  }

  private getUpgradeSources(): string[] {
    return config.UPGRADE_SOURCES ?? [];
  }

  private makeResult(phase: EvolutionPhase, overrides: Partial<EvolutionCycleResult> = {}): EvolutionCycleResult {
    return {
      phase, skillsFetched: 0, skillsInstalled: 0,
      agentsCreated: 0, capabilitiesLearned: 0, selfHealAttempts: 0,
      errors: [], duration: 0, ...overrides,
    };
  }
}
