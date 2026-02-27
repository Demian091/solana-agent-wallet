/**
 * Core Types for Agentic Wallet System
 * Defines interfaces for wallets, transactions, policies, and agent behavior
 */

import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

// Wallet Types
export interface AgentWalletConfig {
  name: string;
  encryptedPrivateKey?: string;
  publicKey: string;
  createdAt: Date;
  lastAccessed?: Date;
  metadata?: Record<string, any>;
}

export interface WalletBalance {
  sol: number;
  tokens: TokenBalance[];
  lastUpdated: Date;
}

export interface TokenBalance {
  mint: string;
  symbol: string;
  decimals: number;
  amount: number;
  uiAmount: number;
  usdValue?: number;
}

// Transaction Types
export interface TransactionRequest {
  id: string;
  type: 'transfer' | 'swap' | 'liquidity' | 'stake' | 'custom';
  priority: 'low' | 'medium' | 'high' | 'critical';
  instructions: any[];
  expectedOutcome?: TransactionOutcome;
  timeout?: number;
  retries?: number;
}

export interface TransactionOutcome {
  expectedAmount?: number;
  slippageTolerance?: number;
  minimumAmountOut?: number;
  deadline?: number;
}

export interface ExecutedTransaction {
  signature: string;
  status: 'confirmed' | 'failed' | 'pending';
  slot: number;
  timestamp: Date;
  fee: number;
  logs?: string[];
  error?: string;
}

// Policy Types
export interface Policy {
  id: string;
  name: string;
  description: string;
  conditions: PolicyCondition[];
  action: 'allow' | 'deny' | 'review';
  priority: number;
  enabled: boolean;
}

export interface PolicyCondition {
  type: 'amount_limit' | 'token_whitelist' | 'time_window' | 'rate_limit' | 'custom';
  params: Record<string, any>;
  operator: 'and' | 'or' | 'not';
}

export interface PolicyEvaluation {
  allowed: boolean;
  reason?: string;
  violations: string[];
  riskScore: number; // 0-100
}

// Agent Types
export interface AgentConfig {
  id: string;
  name: string;
  type: 'trader' | 'liquidity_provider' | 'arbitrage' | 'custom';
  strategy: StrategyConfig;
  riskManagement: RiskConfig;
  walletId: string;
  isActive: boolean;
}

export interface StrategyConfig {
  name: string;
  parameters: Record<string, any>;
  updateInterval: number; // milliseconds
  maxPositions: number;
}

export interface RiskConfig {
  maxDrawdown: number; // percentage
  maxPositionSize: number; // in SOL
  stopLossEnabled: boolean;
  takeProfitEnabled: boolean;
  dailyLossLimit: number;
}

export interface AgentDecision {
  action: 'buy' | 'sell' | 'hold' | 'swap' | 'provide_liquidity' | 'remove_liquidity';
  confidence: number; // 0-1
  reasoning: string;
  transactionRequest?: TransactionRequest;
  timestamp: Date;
}

export interface AgentState {
  status: 'idle' | 'analyzing' | 'executing' | 'error' | 'paused';
  currentTask?: string;
  lastDecision?: AgentDecision;
  performance: AgentPerformance;
  errors: AgentError[];
}

export interface AgentPerformance {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalVolume: number;
  profitLoss: number;
  uptime: number; // percentage
  lastUpdated: Date;
}

export interface AgentError {
  timestamp: Date;
  error: string;
  context?: Record<string, any>;
  recovered: boolean;
}

// Security Types
export interface EncryptionConfig {
  algorithm: 'aes-256-gcm';
  keyDerivation: 'pbkdf2';
  iterations: number;
}

export interface SecurityAudit {
  timestamp: Date;
  event: string;
  severity: 'info' | 'warning' | 'critical';
  details: Record<string, any>;
}

// dApp Integration Types
export interface DAppInteraction {
  protocol: 'jupiter' | 'raydium' | 'orca' | 'marinade' | 'custom';
  action: string;
  params: Record<string, any>;
  expectedResult?: any;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: number;
  outAmount: number;
  otherAmountThreshold: number;
  swapMode: 'ExactIn' | 'ExactOut';
  slippageBps: number;
  platformFee?: number;
  priceImpactPct: number;
  routePlan: any[];
  contextSlot: number;
  timeTaken: number;
}

// Event Types
export type WalletEvent = 
  | { type: 'wallet_created'; payload: { publicKey: string } }
  | { type: 'transaction_signed'; payload: { signature: string; type: string } }
  | { type: 'transaction_confirmed'; payload: { signature: string; slot: number } }
  | { type: 'transaction_failed'; payload: { signature: string; error: string } }
  | { type: 'policy_violation'; payload: { reason: string; transaction: string } }
  | { type: 'agent_decision'; payload: AgentDecision }
  | { type: 'balance_updated'; payload: WalletBalance };

export interface EventHandler {
  (event: WalletEvent): void | Promise<void>;
}
