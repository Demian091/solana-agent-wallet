/**
 * Multi-Agent Orchestrator
 * Manages multiple AI agents with independent wallets
 * 
 * Features:
 * - Agent lifecycle management
 * - Resource allocation
 * - Cross-agent communication
 * - Performance monitoring
 * - Safety controls
 */

import { AgentWallet } from '../core/AgentWallet.js';
import { PolicyEngine } from '../policies/PolicyEngine.js';
import { BaseAgent } from '../agents/BaseAgent.js';
import { TradingAgent, TradingStrategy } from '../agents/TradingAgent.js';
import { AgentConfig, AgentState, AgentPerformance } from '../types/index.js';
import { logger, auditLog } from '../utils/logger.js';

export interface AgentInstance {
  id: string;
  agent: BaseAgent;
  wallet: AgentWallet;
  config: AgentConfig;
  createdAt: Date;
}

export interface OrchestratorConfig {
  maxAgents: number;
  defaultPolicyEngine?: PolicyEngine;
  enableInterAgentCommunication: boolean;
  resourceLimits: {
    maxConcurrentTransactions: number;
    maxDailyVolumePerAgent: number;
  };
}

export class MultiAgentOrchestrator {
  private agents: Map<string, AgentInstance> = new Map();
  private policyEngine: PolicyEngine;
  private config: OrchestratorConfig;
  private globalStats: {
    totalTransactions: number;
    totalVolume: number;
    activeAgents: number;
    startTime: Date;
  };

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      maxAgents: 10,
      enableInterAgentCommunication: true,
      resourceLimits: {
        maxConcurrentTransactions: 5,
        maxDailyVolumePerAgent: 100
      },
      ...config
    };

    this.policyEngine = new PolicyEngine();
    this.globalStats = {
      totalTransactions: 0,
      totalVolume: 0,
      activeAgents: 0,
      startTime: new Date()
    };

    logger.info('MultiAgentOrchestrator initialized', { config: this.config });
  }

  /**
   * Create and register a new trading agent
   */
  async createTradingAgent(
    name: string,
    strategy: TradingStrategy,
    walletPassword: string,
    agentConfig?: Partial<AgentConfig>
  ): Promise<AgentInstance> {
    if (this.agents.size >= this.config.maxAgents) {
      throw new Error(`Maximum number of agents (${this.config.maxAgents}) reached`);
    }

    const id = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info(`Creating trading agent: ${name} (${id})`);

    // Create wallet for agent
    const wallet = await AgentWallet.create(name, walletPassword, {
      autoAirdrop: true,
      airdropAmount: 2
    });

    // Create agent config
    const config: AgentConfig = {
      id,
      name,
      type: 'trader',
      walletId: wallet.getAddress(),
      isActive: true,
      strategy: {
        name: strategy.name,
        parameters: strategy.parameters,
        updateInterval: 30000, // 30 seconds
        maxPositions: 5
      },
      riskManagement: {
        maxDrawdown: 0.1, // 10%
        maxPositionSize: 1, // 1 SOL
        stopLossEnabled: true,
        takeProfitEnabled: true,
        dailyLossLimit: 0.5 // 0.5 SOL
      },
      ...agentConfig
    };

    // Create trading agent
    const agent = new TradingAgent({
      config,
      wallet,
      policyEngine: this.policyEngine,
      strategy
    });

    // Set up event handlers
    this.setupAgentEventHandlers(agent, id);

    const instance: AgentInstance = {
      id,
      agent,
      wallet,
      config,
      createdAt: new Date()
    };

    this.agents.set(id, instance);
    this.globalStats.activeAgents++;

    auditLog('agent_created', {
      agentId: id,
      name,
      type: 'trader',
      wallet: wallet.getAddress(),
      strategy: strategy.name
    });

    logger.info(`Trading agent created successfully`, { agentId: id, wallet: wallet.getAddress() });

    return instance;
  }

  /**
   * Start an agent
   */
  async startAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (instance.config.isActive) {
      logger.warn(`Agent ${agentId} is already active`);
      return;
    }

    await instance.agent.start();
    instance.config.isActive = true;

    logger.info(`Agent ${agentId} started`);
  }

  /**
   * Stop an agent
   */
  async stopAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    await instance.agent.stop();
    instance.config.isActive = false;
    this.globalStats.activeAgents--;

    logger.info(`Agent ${agentId} stopped`);
  }

  /**
   * Pause an agent
   */
  pauseAgent(agentId: string): void {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    instance.agent.pause();
  }

  /**
   * Resume an agent
   */
  resumeAgent(agentId: string): void {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    instance.agent.resume();
  }

  /**
   * Remove an agent
   */
  async removeAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Stop if running
    if (instance.config.isActive) {
      await this.stopAgent(agentId);
    }

    // Secure wipe wallet
    instance.wallet.secureWipe();

    this.agents.delete(agentId);

    auditLog('agent_removed', {
      agentId,
      name: instance.config.name,
      runtime: Date.now() - instance.createdAt.getTime()
    });

    logger.info(`Agent ${agentId} removed`);
  }

  /**
   * Get agent information
   */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent states
   */
  getAgentStates(): Array<{ id: string; state: AgentState }> {
    return Array.from(this.agents.entries()).map(([id, instance]) => ({
      id,
      state: instance.agent.getState()
    }));
  }

  /**
   * Get performance metrics for all agents
   */
  getPerformanceMetrics(): Array<{ id: string; performance: AgentPerformance }> {
    return Array.from(this.agents.entries()).map(([id, instance]) => ({
      id,
      performance: instance.agent.getPerformance()
    }));
  }

  /**
   * Get global statistics
   */
  getGlobalStats(): typeof this.globalStats {
    return { ...this.globalStats };
  }

  /**
   * Emergency stop all agents
   */
  async emergencyStop(): Promise<void> {
    logger.warn('EMERGENCY STOP initiated - stopping all agents');

    const stopPromises = Array.from(this.agents.values())
      .filter(instance => instance.config.isActive)
      .map(instance => this.stopAgent(instance.id));

    await Promise.all(stopPromises);

    auditLog('emergency_stop', {
      agentsStopped: this.agents.size,
      timestamp: new Date().toISOString()
    }, 'critical');
  }

  /**
   * Broadcast message to all agents
   */
  broadcast(message: any): void {
    if (!this.config.enableInterAgentCommunication) return;

    this.agents.forEach((instance, id) => {
      instance.agent.emit('broadcast', { from: 'orchestrator', message });
    });
  }

  /**
   * Get wallet for agent
   */
  getAgentWallet(agentId: string): AgentWallet | undefined {
    return this.agents.get(agentId)?.wallet;
  }

  /**
   * Fund agent wallet
   */
  async fundAgentWallet(agentId: string, amountSol: number): Promise<string> {
    const wallet = this.getAgentWallet(agentId);
    if (!wallet) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // In production, this would transfer from treasury
    // For demo, request airdrop
    const signature = await connectionManager.requestAirdrop(
      wallet.getPublicKey(),
      amountSol
    );

    logger.info(`Funded agent ${agentId} wallet with ${amountSol} SOL`, { signature });
    return signature;
  }

  /**
   * Set up event handlers for agent
   */
  private setupAgentEventHandlers(agent: BaseAgent, agentId: string): void {
    agent.on('trade_executed', (data) => {
      this.globalStats.totalTransactions++;
      logger.info(`Agent ${agentId} executed trade`, data);
    });

    agent.on('error', (data) => {
      logger.error(`Agent ${agentId} error`, data);
    });

    agent.on('policy_violation', (data) => {
      logger.warn(`Agent ${agentId} policy violation`, data);
    });

    agent.on('balance_updated', (data) => {
      logger.debug(`Agent ${agentId} balance updated`, data);
    });
  }

  /**
   * Generate system report
   */
  generateReport(): object {
    const agents = this.getAllAgents();
    const totalUptime = agents.reduce((sum, a) => 
      sum + (Date.now() - a.createdAt.getTime()), 0
    );

    return {
      summary: {
        totalAgents: agents.length,
        activeAgents: this.globalStats.activeAgents,
        totalTransactions: this.globalStats.totalTransactions,
        averageUptime: totalUptime / agents.length / 1000 / 60 // minutes
      },
      agents: agents.map(instance => ({
        id: instance.id,
        name: instance.config.name,
        type: instance.config.type,
        status: instance.agent.getState().status,
        wallet: instance.wallet.getAddress(),
        performance: instance.agent.getPerformance(),
        createdAt: instance.createdAt
      })),
      globalStats: this.globalStats,
      policies: this.policyEngine.getPolicies()
    };
  }
}

export default MultiAgentOrchestrator;
