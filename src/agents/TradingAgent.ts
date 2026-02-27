/**
 * Trading Agent Implementation
 * Autonomous trading bot with strategy execution
 * 
 * Strategies:
 * - Trend following (momentum)
 * - Mean reversion
 * - Arbitrage detection
 * - DCA (Dollar Cost Averaging)
 */

import { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL 
} from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';
import { BaseAgent } from './BaseAgent.js';
import { 
  AgentDecision, 
  TransactionRequest, 
  SwapQuote,
  DAppInteraction 
} from '../types/index.js';
import { connectionManager } from '../utils/solana.js';
import { logger } from '../utils/logger.js';

export interface TradingStrategy {
  name: 'trend_following' | 'mean_reversion' | 'arbitrage' | 'dca';
  parameters: {
    targetToken: string; // Token mint address
    baseToken: string;   // Usually SOL or USDC
    tradeAmount: number; // Amount per trade
    maxSlippage: number; // Max slippage in bps
    takeProfit?: number; // Percentage
    stopLoss?: number;   // Percentage
  };
}

export class TradingAgent extends BaseAgent {
  private strategy: TradingStrategy;
  private priceHistory: Map<string, number[]> = new Map();
  private lastTradeTime: Map<string, number> = new Map();
  private positions: Map<string, { entryPrice: number; amount: number; timestamp: number }> = new Map();

  constructor(options: any & { strategy: TradingStrategy }) {
    super(options);
    this.strategy = options.strategy;

    // Validate strategy
    if (!this.validateStrategy()) {
      throw new Error('Invalid trading strategy configuration');
    }
  }

  /**
   * Validate strategy parameters
   */
  private validateStrategy(): boolean {
    const { parameters } = this.strategy;

    if (parameters.tradeAmount <= 0) {
      logger.error('Trade amount must be positive');
      return false;
    }

    if (parameters.maxSlippage < 0 || parameters.maxSlippage > 1000) {
      logger.error('Max slippage must be between 0 and 1000 bps');
      return false;
    }

    return true;
  }

  /**
   * Main strategy execution
   */
  protected async executeStrategy(): Promise<void> {
    try {
      // Get market data
      const marketData = await this.fetchMarketData();

      // Update price history
      this.updatePriceHistory(marketData);

      // Make trading decision
      const decision = await this.makeDecision(marketData);

      if (decision.action !== 'hold' && decision.confidence > 0.7) {
        logger.info(`Trading signal: ${decision.action} with confidence ${decision.confidence}`);

        // Create and execute transaction
        const txRequest = await this.createTransactionRequest(decision);

        if (txRequest) {
          const success = await this.executeTransaction(txRequest);

          if (success) {
            this.updatePositions(decision, marketData);
            this.state.lastDecision = decision;

            this.emit('trade_executed', {
              agentId: this.config.id,
              decision,
              transactionId: txRequest.id
            });
          }
        }
      }
    } catch (error) {
      await this.handleError(error as Error, 'strategy_execution');
    }
  }

  /**
   * Make trading decision based on strategy
   */
  protected async makeDecision(marketData?: any): Promise<AgentDecision> {
    const { name, parameters } = this.strategy;

    switch (name) {
      case 'trend_following':
        return this.trendFollowingDecision(marketData);

      case 'mean_reversion':
        return this.meanReversionDecision(marketData);

      case 'dca':
        return this.dcaDecision(marketData);

      case 'arbitrage':
        return this.arbitrageDecision(marketData);

      default:
        return {
          action: 'hold',
          confidence: 0,
          reasoning: 'Unknown strategy',
          timestamp: new Date()
        };
    }
  }

  /**
   * Trend Following Strategy
   * Buy when price is trending up, sell when trending down
   */
  private trendFollowingDecision(marketData: any): AgentDecision {
    const prices = this.priceHistory.get(this.strategy.parameters.targetToken) || [];

    if (prices.length < 20) {
      return {
        action: 'hold',
        confidence: 0,
        reasoning: 'Insufficient price history',
        timestamp: new Date()
      };
    }

    // Calculate moving averages
    const shortMA = this.calculateMA(prices, 5);
    const longMA = this.calculateMA(prices, 20);

    const currentPrice = prices[prices.length - 1];

    // Check existing position
    const position = this.positions.get(this.strategy.parameters.targetToken);

    if (shortMA > longMA * 1.02) {
      // Uptrend - Buy signal
      if (!position) {
        return {
          action: 'buy',
          confidence: Math.min((shortMA / longMA - 1) * 10, 0.95),
          reasoning: `Short MA (${shortMA.toFixed(4)}) above Long MA (${longMA.toFixed(4)})`,
          timestamp: new Date()
        };
      }
    } else if (shortMA < longMA * 0.98) {
      // Downtrend - Sell signal
      if (position) {
        // Check stop loss / take profit
        const pnl = (currentPrice - position.entryPrice) / position.entryPrice;

        if (pnl <= -(this.strategy.parameters.stopLoss || 0.05)) {
          return {
            action: 'sell',
            confidence: 0.9,
            reasoning: `Stop loss triggered at ${(pnl * 100).toFixed(2)}%`,
            timestamp: new Date()
          };
        }

        if (pnl >= (this.strategy.parameters.takeProfit || 0.1)) {
          return {
            action: 'sell',
            confidence: 0.9,
            reasoning: `Take profit triggered at ${(pnl * 100).toFixed(2)}%`,
            timestamp: new Date()
          };
        }

        return {
          action: 'sell',
          confidence: Math.min((1 - shortMA / longMA) * 10, 0.95),
          reasoning: `Short MA below Long MA - trend reversal`,
          timestamp: new Date()
        };
      }
    }

    return {
      action: 'hold',
      confidence: 0.5,
      reasoning: 'No clear trend',
      timestamp: new Date()
    };
  }

  /**
   * Mean Reversion Strategy
   * Buy when price deviates significantly below mean, sell when above
   */
  private meanReversionDecision(marketData: any): AgentDecision {
    const prices = this.priceHistory.get(this.strategy.parameters.targetToken) || [];

    if (prices.length < 20) {
      return {
        action: 'hold',
        confidence: 0,
        reasoning: 'Insufficient price history',
        timestamp: new Date()
      };
    }

    const mean = this.calculateMA(prices, 20);
    const stdDev = this.calculateStdDev(prices, mean);
    const currentPrice = prices[prices.length - 1];
    const zScore = (currentPrice - mean) / stdDev;

    const position = this.positions.get(this.strategy.parameters.targetToken);

    if (zScore < -2 && !position) {
      // Price significantly below mean - buy
      return {
        action: 'buy',
        confidence: Math.min(Math.abs(zScore) / 3, 0.95),
        reasoning: `Price ${zScore.toFixed(2)} std dev below mean`,
        timestamp: new Date()
      };
    } else if (zScore > 2 && position) {
      // Price significantly above mean - sell
      return {
        action: 'sell',
        confidence: Math.min(Math.abs(zScore) / 3, 0.95),
        reasoning: `Price ${zScore.toFixed(2)} std dev above mean`,
        timestamp: new Date()
      };
    }

    return {
      action: 'hold',
      confidence: 0.5,
      reasoning: `Z-score: ${zScore.toFixed(2)} - within normal range`,
      timestamp: new Date()
    };
  }

  /**
   * DCA Strategy
   * Buy at regular intervals regardless of price
   */
  private dcaDecision(marketData: any): AgentDecision {
    const lastTrade = this.lastTradeTime.get('dca') || 0;
    const interval = this.config.strategy.updateInterval;

    if (Date.now() - lastTrade >= interval) {
      return {
        action: 'buy',
        confidence: 1.0,
        reasoning: 'DCA interval reached',
        timestamp: new Date()
      };
    }

    return {
      action: 'hold',
      confidence: 0,
      reasoning: 'Waiting for next DCA interval',
      timestamp: new Date()
    };
  }

  /**
   * Arbitrage Strategy (simplified)
   * Would check multiple DEXs for price discrepancies
   */
  private arbitrageDecision(marketData: any): AgentDecision {
    // Placeholder - real implementation would compare Jupiter, Raydium, Orca prices
    return {
      action: 'hold',
      confidence: 0,
      reasoning: 'Arbitrage opportunity detection not implemented in demo',
      timestamp: new Date()
    };
  }

  /**
   * Create transaction request from decision
   */
  private async createTransactionRequest(decision: AgentDecision): Promise<TransactionRequest | null> {
    const { parameters } = this.strategy;

    // For demo purposes, we'll create a simple SOL transfer
    // In production, this would integrate with Jupiter/Raydium for actual swaps

    const transaction: TransactionRequest = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: decision.action === 'buy' || decision.action === 'sell' ? 'swap' : 'transfer',
      priority: 'medium',
      instructions: [], // Would contain actual swap instructions
      expectedOutcome: {
        expectedAmount: parameters.tradeAmount,
        slippageTolerance: parameters.maxSlippage / 10000, // Convert bps to decimal
        deadline: Date.now() + 60000 // 1 minute
      },
      timeout: 30000,
      retries: 3
    };

    // Add metadata for policy engine
    (transaction as any).metadata = {
      strategy: this.strategy.name,
      targetToken: parameters.targetToken,
      baseToken: parameters.baseToken,
      action: decision.action,
      amount: parameters.tradeAmount
    };

    return transaction;
  }

  /**
   * Fetch market data (simplified)
   */
  private async fetchMarketData(): Promise<any> {
    // In production, this would fetch from Jupiter API, Birdeye, etc.
    // For demo, return mock data
    return {
      price: 100 + Math.random() * 10,
      volume24h: 1000000,
      timestamp: Date.now()
    };
  }

  /**
   * Update price history
   */
  private updatePriceHistory(marketData: any): void {
    const token = this.strategy.parameters.targetToken;

    if (!this.priceHistory.has(token)) {
      this.priceHistory.set(token, []);
    }

    const history = this.priceHistory.get(token)!;
    history.push(marketData.price);

    // Keep last 100 prices
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Update positions after trade
   */
  private updatePositions(decision: AgentDecision, marketData: any): void {
    const token = this.strategy.parameters.targetToken;

    if (decision.action === 'buy') {
      this.positions.set(token, {
        entryPrice: marketData.price,
        amount: this.strategy.parameters.tradeAmount,
        timestamp: Date.now()
      });
    } else if (decision.action === 'sell') {
      this.positions.delete(token);
    }

    this.lastTradeTime.set(this.strategy.name, Date.now());
  }

  /**
   * Calculate moving average
   */
  private calculateMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];

    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(prices: number[], mean: number): number {
    const squareDiffs = prices.map(price => Math.pow(price - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / prices.length;
    return Math.sqrt(avgSquareDiff);
  }

  /**
   * Get current positions
   */
  getPositions(): Map<string, any> {
    return new Map(this.positions);
  }

  /**
   * Get price history
   */
  getPriceHistory(token?: string): number[] {
    const target = token || this.strategy.parameters.targetToken;
    return [...(this.priceHistory.get(target) || [])];
  }
}

export default TradingAgent;
