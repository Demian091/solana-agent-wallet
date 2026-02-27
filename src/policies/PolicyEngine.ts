/**
 * Policy Engine for Agentic Wallet
 * Implements fine-grained access control and transaction validation
 * 
 * Features:
 * - Amount limits (per transaction, daily, weekly)
 * - Token whitelisting/blacklisting
 * - Time-based restrictions
 * - Rate limiting
 * - Risk scoring
 */

import { 
  Policy, 
  PolicyCondition, 
  PolicyEvaluation, 
  TransactionRequest,
  AgentConfig 
} from '../types/index.js';
import { logger, auditLog } from '../utils/logger.js';

export interface PolicyContext {
  agentId: string;
  walletAddress: string;
  dailyVolume: number;
  dailyTransactionCount: number;
  lastTransactionTime?: Date;
  agentType: string;
}

export class PolicyEngine {
  private policies: Map<string, Policy> = new Map();
  private transactionHistory: Map<string, any[]> = new Map(); // agentId -> transactions
  private dailyStats: Map<string, { volume: number; count: number; date: string }> = new Map();

  constructor() {
    this.initializeDefaultPolicies();
  }

  /**
   * Initialize default safety policies
   */
  private initializeDefaultPolicies(): void {
    // Policy 1: Max transaction amount
    this.addPolicy({
      id: 'max-transaction-amount',
      name: 'Maximum Transaction Amount',
      description: 'Limits single transaction size',
      conditions: [{
        type: 'amount_limit',
        params: { maxAmountSol: 1.0 },
        operator: 'and'
      }],
      action: 'deny',
      priority: 100,
      enabled: true
    });

    // Policy 2: Daily volume limit
    this.addPolicy({
      id: 'daily-volume-limit',
      name: 'Daily Volume Limit',
      description: 'Limits total daily trading volume',
      conditions: [{
        type: 'rate_limit',
        params: { maxDailyVolumeSol: 10.0 },
        operator: 'and'
      }],
      action: 'deny',
      priority: 90,
      enabled: true
    });

    // Policy 3: Token whitelist
    this.addPolicy({
      id: 'token-whitelist',
      name: 'Allowed Tokens Only',
      description: 'Only allow specific tokens',
      conditions: [{
        type: 'token_whitelist',
        params: { 
          allowedTokens: [
            'SOL',
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'  // USDT
          ] 
        },
        operator: 'and'
      }],
      action: 'deny',
      priority: 80,
      enabled: true
    });

    // Policy 4: Business hours only (optional)
    this.addPolicy({
      id: 'business-hours',
      name: 'Business Hours Only',
      description: 'Restrict high-risk transactions to business hours',
      conditions: [{
        type: 'time_window',
        params: { startHour: 9, endHour: 17, timezone: 'UTC' },
        operator: 'and'
      }],
      action: 'review',
      priority: 50,
      enabled: false // Disabled by default
    });

    // Policy 5: Rate limiting
    this.addPolicy({
      id: 'rate-limit',
      name: 'Transaction Rate Limit',
      description: 'Max 10 transactions per minute',
      conditions: [{
        type: 'rate_limit',
        params: { maxPerMinute: 10 },
        operator: 'and'
      }],
      action: 'deny',
      priority: 70,
      enabled: true
    });
  }

  /**
   * Add a custom policy
   */
  addPolicy(policy: Policy): void {
    this.policies.set(policy.id, policy);
    logger.info(`Policy added: ${policy.name}`, { policyId: policy.id });
  }

  /**
   * Remove a policy
   */
  removePolicy(policyId: string): boolean {
    const deleted = this.policies.delete(policyId);
    if (deleted) {
      logger.info(`Policy removed: ${policyId}`);
    }
    return deleted;
  }

  /**
   * Update policy status
   */
  setPolicyEnabled(policyId: string, enabled: boolean): void {
    const policy = this.policies.get(policyId);
    if (policy) {
      policy.enabled = enabled;
      logger.info(`Policy ${enabled ? 'enabled' : 'disabled'}: ${policyId}`);
    }
  }

  /**
   * Evaluate transaction against all policies
   */
  evaluateTransaction(
    transaction: TransactionRequest,
    context: PolicyContext
  ): PolicyEvaluation {
    const violations: string[] = [];
    let riskScore = 0;
    let requiresReview = false;

    // Sort policies by priority (highest first)
    const sortedPolicies = Array.from(this.policies.values())
      .filter(p => p.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const policy of sortedPolicies) {
      const result = this.evaluatePolicy(policy, transaction, context);

      if (!result.passed) {
        violations.push(`${policy.name}: ${result.reason}`);
        riskScore += this.calculateRiskScore(policy, result);

        if (policy.action === 'deny') {
          auditLog('policy_violation', {
            policyId: policy.id,
            transactionId: transaction.id,
            agentId: context.agentId,
            reason: result.reason
          }, 'warning');

          return {
            allowed: false,
            reason: result.reason,
            violations,
            riskScore: Math.min(riskScore, 100)
          };
        } else if (policy.action === 'review') {
          requiresReview = true;
        }
      }
    }

    // Update daily stats
    this.updateDailyStats(context.agentId, transaction);

    return {
      allowed: true,
      reason: requiresReview ? 'Requires manual review' : undefined,
      violations,
      riskScore: Math.min(riskScore, 100)
    };
  }

  /**
   * Evaluate single policy
   */
  private evaluatePolicy(
    policy: Policy,
    transaction: TransactionRequest,
    context: PolicyContext
  ): { passed: boolean; reason?: string } {
    for (const condition of policy.conditions) {
      const result = this.evaluateCondition(condition, transaction, context);

      if (condition.operator === 'not') {
        if (result.passed) {
          return { passed: false, reason: `Condition violated: ${condition.type}` };
        }
      } else if (condition.operator === 'and') {
        if (!result.passed) {
          return { passed: false, reason: result.reason || `Condition failed: ${condition.type}` };
        }
      } else if (condition.operator === 'or') {
        if (result.passed) {
          return { passed: true };
        }
      }
    }

    return { passed: true };
  }

  /**
   * Evaluate single condition
   */
  private evaluateCondition(
    condition: PolicyCondition,
    transaction: TransactionRequest,
    context: PolicyContext
  ): { passed: boolean; reason?: string } {
    switch (condition.type) {
      case 'amount_limit': {
        const maxAmount = condition.params.maxAmountSol || Infinity;
        const amount = this.extractAmount(transaction);

        if (amount > maxAmount) {
          return { 
            passed: false, 
            reason: `Amount ${amount} SOL exceeds limit of ${maxAmount} SOL` 
          };
        }
        return { passed: true };
      }

      case 'token_whitelist': {
        const tokens = this.extractTokens(transaction);
        const allowed = condition.params.allowedTokens || [];

        const invalidTokens = tokens.filter(t => !allowed.includes(t));
        if (invalidTokens.length > 0) {
          return { 
            passed: false, 
            reason: `Tokens not in whitelist: ${invalidTokens.join(', ')}` 
          };
        }
        return { passed: true };
      }

      case 'time_window': {
        const now = new Date();
        const hour = now.getUTCHours();
        const startHour = condition.params.startHour || 0;
        const endHour = condition.params.endHour || 24;

        if (hour < startHour || hour >= endHour) {
          return { 
            passed: false, 
            reason: `Outside allowed hours (${startHour}:00 - ${endHour}:00 UTC)` 
          };
        }
        return { passed: true };
      }

      case 'rate_limit': {
        const stats = this.getDailyStats(context.agentId);

        // Check daily volume
        if (condition.params.maxDailyVolumeSol) {
          if (stats.volume >= condition.params.maxDailyVolumeSol) {
            return { 
              passed: false, 
              reason: `Daily volume limit of ${condition.params.maxDailyVolumeSol} SOL exceeded` 
            };
          }
        }

        // Check transaction rate
        if (condition.params.maxPerMinute) {
          const recentTx = this.getRecentTransactions(context.agentId, 60);
          if (recentTx.length >= condition.params.maxPerMinute) {
            return { 
              passed: false, 
              reason: `Rate limit exceeded: ${condition.params.maxPerMinute} transactions per minute` 
            };
          }
        }

        return { passed: true };
      }

      case 'custom': {
        // Custom condition logic would go here
        return { passed: true };
      }

      default:
        return { passed: true };
    }
  }

  /**
   * Extract amount from transaction (simplified)
   */
  private extractAmount(transaction: TransactionRequest): number {
    // This would parse the actual transaction instructions
    // For now, return a placeholder based on expected outcome
    return transaction.expectedOutcome?.expectedAmount || 0;
  }

  /**
   * Extract tokens from transaction
   */
  private extractTokens(transaction: TransactionRequest): string[] {
    // This would parse token mints from instructions
    return ['SOL']; // Placeholder
  }

  /**
   * Calculate risk score for violation
   */
  private calculateRiskScore(policy: Policy, result: any): number {
    // Higher priority policies contribute more to risk score
    return policy.priority / 10;
  }

  /**
   * Update daily statistics
   */
  private updateDailyStats(agentId: string, transaction: TransactionRequest): void {
    const today = new Date().toISOString().split('T')[0];
    const current = this.dailyStats.get(agentId) || { volume: 0, count: 0, date: today };

    if (current.date !== today) {
      current.volume = 0;
      current.count = 0;
      current.date = today;
    }

    current.volume += this.extractAmount(transaction);
    current.count += 1;

    this.dailyStats.set(agentId, current);
  }

  /**
   * Get daily stats for agent
   */
  getDailyStats(agentId: string): { volume: number; count: number; date: string } {
    return this.dailyStats.get(agentId) || { volume: 0, count: 0, date: new Date().toISOString().split('T')[0] };
  }

  /**
   * Get recent transactions within seconds
   */
  private getRecentTransactions(agentId: string, seconds: number): any[] {
    const history = this.transactionHistory.get(agentId) || [];
    const cutoff = Date.now() - (seconds * 1000);
    return history.filter(tx => tx.timestamp > cutoff);
  }

  /**
   * Record transaction for history
   */
  recordTransaction(agentId: string, transaction: any): void {
    if (!this.transactionHistory.has(agentId)) {
      this.transactionHistory.set(agentId, []);
    }

    const history = this.transactionHistory.get(agentId)!;
    history.push({
      ...transaction,
      timestamp: Date.now()
    });

    // Keep only last 1000 transactions
    if (history.length > 1000) {
      history.shift();
    }
  }

  /**
   * Get all policies
   */
  getPolicies(): Policy[] {
    return Array.from(this.policies.values());
  }
}

export default PolicyEngine;
