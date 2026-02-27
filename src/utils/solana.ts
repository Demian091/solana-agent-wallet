/**
 * Solana Network Utilities
 * Connection management, airdrop helpers, and network utilities
 */

import { 
  Connection, 
  clusterApiUrl, 
  LAMPORTS_PER_SOL,
  PublicKey,
  Commitment
} from '@solana/web3.js';
import { logger } from './logger.js';

export interface NetworkConfig {
  rpcUrl: string;
  wsUrl?: string;
  commitment: Commitment;
  confirmTransactionInitialTimeout?: number;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  devnet: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    wsUrl: process.env.SOLANA_WS_URL || 'wss://api.devnet.solana.com',
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000
  },
  testnet: {
    rpcUrl: 'https://api.testnet.solana.com',
    commitment: 'confirmed'
  },
  mainnet: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    commitment: 'confirmed'
  }
};

export class SolanaConnectionManager {
  private connections: Map<string, Connection> = new Map();
  private currentNetwork: string = 'devnet';

  getConnection(network?: string): Connection {
    const net = network || this.currentNetwork;

    if (!this.connections.has(net)) {
      const config = NETWORKS[net];
      if (!config) {
        throw new Error(`Unknown network: ${net}`);
      }

      const connection = new Connection(config.rpcUrl, {
        commitment: config.commitment,
        confirmTransactionInitialTimeout: config.confirmTransactionInitialTimeout,
        wsEndpoint: config.wsUrl
      });

      this.connections.set(net, connection);
      logger.info(`Created connection to ${net}`, { rpcUrl: config.rpcUrl });
    }

    return this.connections.get(net)!;
  }

  setNetwork(network: string): void {
    if (!NETWORKS[network]) {
      throw new Error(`Unknown network: ${network}`);
    }
    this.currentNetwork = network;
    logger.info(`Switched to network`, { network });
  }

  getCurrentNetwork(): string {
    return this.currentNetwork;
  }

  /**
   * Request airdrop on devnet/testnet
   */
  async requestAirdrop(publicKey: PublicKey, amountSol: number = 2): Promise<string> {
    const connection = this.getConnection();
    const lamports = amountSol * LAMPORTS_PER_SOL;

    try {
      const signature = await connection.requestAirdrop(publicKey, lamports);
      await connection.confirmTransaction(signature, 'confirmed');
      logger.info(`Airdropped ${amountSol} SOL to ${publicKey.toString()}`, { signature });
      return signature;
    } catch (error) {
      logger.error('Airdrop failed', { error, publicKey: publicKey.toString() });
      throw error;
    }
  }

  /**
   * Get account balance with retry logic
   */
  async getBalance(publicKey: PublicKey, retries: number = 3): Promise<number> {
    const connection = this.getConnection();

    for (let i = 0; i < retries; i++) {
      try {
        const balance = await connection.getBalance(publicKey);
        return balance / LAMPORTS_PER_SOL;
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }

    throw new Error('Failed to get balance after retries');
  }

  /**
   * Check if account exists
   */
  async accountExists(publicKey: PublicKey): Promise<boolean> {
    const connection = this.getConnection();
    try {
      const account = await connection.getAccountInfo(publicKey);
      return account !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get latest blockhash with fallback
   */
  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    const connection = this.getConnection();
    return await connection.getLatestBlockhash('confirmed');
  }
}

// Singleton instance
export const connectionManager = new SolanaConnectionManager();
