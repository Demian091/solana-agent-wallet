/**
 * Base Agent Class
 * Abstract base for all AI agents in the system
 * 
 * Features:
 * - Lifecycle management (start, stop, pause)
 * - Event-driven architecture
 * - Error handling and recovery
 * - Performance tracking
 * - Policy compliance
 */

import { EventEmitter } from 'events';
import { AgentWallet } from '../core/AgentWallet.js';
import { PolicyEngine, PolicyContext } from '../policies/PolicyEngine.js';
import { 
  AgentConfig, 
  AgentState, 
  AgentDecision, 
  AgentPerformance,
  AgentError,
  TransactionRequest,
  WalletEvent 
} from '../types/index.js';
import { logger, auditLog } from '../utils/logger.js';

export interface AgentOptions {
  config: AgentConfig;
  wallet: AgentWallet;
  policyEngine: PolicyEngine;
}

export abstract class BaseAgent extends EventEmitter {
  protected config: AgentConfig;
  protected wallet: AgentWallet;
  protected policyEngine: PolicyEngine;
  protected state: AgentState;
  protected isRunning: boolean = false;
  protected intervalId?: NodeJS.Timeout;
  protected errorCount: number = 0;
  protected maxErrors: number = 5;

  constructor(options: AgentOptions) {
    super();
    this.config = options.config;
    this.wallet = options.wallet;
    this.policyEngine = options.policyEngine;

    this.state = {
      status: 'idle',
      performance: {
        totalTransactions: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        totalVolume: 0,
        profitLoss: 0,
        uptime: 100,
        lastUpdated: new Date()
      },
      errors: []
    };

    // Listen to wallet events
    this.wallet.onEvent(this.handleWalletEvent.bind(this));
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn(`Agent ${this.config.id} is already running`);
      return;
    }

    logger.info(`Starting agent: ${this.config.name} (${this.config.id})`);

    this.isRunning = true;
    this.state.status = 'analyzing';
    this.errorCount = 0;

    auditLog('agent_started', {
      agentId: this.config.id,
      type: this.config.type,
      wallet: this.wallet.getAddress()
    });

    // Start main loop
    this.runLoop();

    this.emit('started', { agentId: this.config.id });
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info(`Stopping agent: ${this.config.name}`);

    this.isRunning = false;
    this.state.status = 'idle';

    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = undefined;
    }

    auditLog('agent_stopped', {
      agentId: this.config.id,
      performance: this.state.performance
    });

    this.emit('stopped', { agentId: this.config.id });
  }

  /**
   * Pause agent temporarily
   */
  pause(): void {
    if (this.state.status === 'executing') {
      logger.warn('Cannot pause while executing transaction');
      return;
    }

    this.state.status = 'paused';
    logger.info(`Agent ${this.config.id} paused`);
    this.emit('paused', { agentId: this.config.id });
  }

  /**
   * Resume agent
   */
  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'analyzing';
      logger.info(`Agent ${this.config.id} resumed`);
      this.emit('resumed', { agentId: this.config.id });
    }
  }

  /**
   * Main execution loop
   */
  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        if (this.state.status === 'paused') {
          await this.sleep(1000);
          continue;
        }

        // Check if too many errors
        if (this.errorCount >= this.maxErrors) {
          logger.error(`Agent ${this.config.id} exceeded error limit, stopping`);
          await this.stop();
          break;
        }

        // Execute strategy
        await this.executeStrategy();

        // Wait for next iteration
        await this.sleep(this.config.strategy.updateInterval);
      } catch (error) {
        await this.handleError(error as Error, 'main_loop');
      }
    }
  }

  /**
   * Execute agent strategy (implemented by subclasses)
   */
  protected abstract executeStrategy(): Promise<void>;

  /**
   * Make a decision (implemented by subclasses)
   */
  protected abstract makeDecision(): Promise<AgentDecision>;

  /**
   * Execute transaction with policy checking
   */
  protected async executeTransaction(request: TransactionRequest): Promise<boolean> {
    this.state.status = 'executing';
    this.state.currentTask = `Executing ${request.type} transaction`;

    try {
      // Build policy context
      const context: PolicyContext = {
        agentId: this.config.id,
        walletAddress: this.wallet.getAddress(),
        dailyVolume: this.state.performance.totalVolume,
        dailyTransactionCount: this.state.performance.totalTransactions,
        agentType: this.config.type
      };

      // Evaluate against policies
      const evaluation = this.policyEngine.evaluateTransaction(request, context);

      if (!evaluation.allowed) {
        logger.warn(`Transaction blocked by policy: ${evaluation.reason}`, {
          agentId: this.config.id,
          violations: evaluation.violations
        });

        this.emit('policy_violation', {
          agentId: this.config.id,
          reason: evaluation.reason,
          violations: evaluation.violations
        });

        return false;
      }

      if (evaluation.reason) {
        logger.info(`Transaction requires review: ${evaluation.reason}`);
        // Could implement human-in-the-loop here
      }

      // Execute transaction
      // Note: Actual execution depends on transaction type
      // This is handled by specific agent implementations

      this.policyEngine.recordTransaction(this.config.id, request);

      // Update performance
      this.state.performance.totalTransactions++;
      this.state.performance.successfulTransactions++;
      this.state.performance.lastUpdated = new Date();

      logger.info(`Transaction executed successfully`, {
        agentId: this.config.id,
        transactionId: request.id
      });

      return true;
    } catch (error) {
      this.state.performance.failedTransactions++;
      throw error;
    } finally {
      this.state.status = 'analyzing';
      this.state.currentTask = undefined;
    }
  }

  /**
   * Handle wallet events
   */
  private handleWalletEvent(event: WalletEvent): void {
    switch (event.type) {
      case 'transaction_confirmed':
        this.state.performance.totalVolume += 1; // Would calculate actual volume
        break;
      case 'transaction_failed':
        this.state.performance.failedTransactions++;
        break;
      case 'balance_updated':
        this.emit('balance_updated', event.payload);
        break;
    }
  }

  /**
   * Handle errors with recovery logic
   */
  protected async handleError(error: Error, context: string): Promise<void> {
    this.errorCount++;

    const agentError: AgentError = {
      timestamp: new Date(),
      error: error.message,
      context: { context, stack: error.stack },
      recovered: false
    };

    this.state.errors.push(agentError);

    // Keep only last 50 errors
    if (this.state.errors.length > 50) {
      this.state.errors.shift();
    }

    logger.error(`Agent ${this.config.id} error in ${context}`, {
      error: error.message,
      errorCount: this.errorCount
    });

    auditLog('agent_error', {
      agentId: this.config.id,
      error: error.message,
      context
    }, 'warning');

    this.emit('error', { agentId: this.config.id, error, context });

    // Attempt recovery
    if (this.errorCount < this.maxErrors) {
      logger.info(`Attempting recovery for agent ${this.config.id}`);
      await this.sleep(5000); // Backoff
    }
  }

  /**
   * Get current state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Get performance metrics
   */
  getPerformance(): AgentPerformance {
    return { ...this.state.performance };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info(`Agent ${this.config.id} config updated`);
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get agent info
   */
  getInfo(): { id: string; name: string; type: string; status: string; wallet: string } {
    return {
      id: this.config.id,
      name: this.config.name,
      type: this.config.type,
      status: this.state.status,
      wallet: this.wallet.getAddress()
    };
  }
}

export default BaseAgent;
