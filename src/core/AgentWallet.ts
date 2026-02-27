/**
 * AgentWallet - Core Wallet Implementation for AI Agents
 * 
 * Features:
 * - Programmatic wallet creation and management
 * - Encrypted key storage (AES-256-GCM)
 * - Automated transaction signing
 * - SPL token support
 * - Event-driven architecture
 * - Policy-based transaction validation
 */

import { 
  Keypair, 
  PublicKey, 
  Transaction, 
  VersionedTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  SendOptions
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import bs58 from 'bs58';
import { EventEmitter } from 'events';

import { 
  AgentWalletConfig, 
  WalletBalance, 
  TokenBalance, 
  TransactionRequest,
  ExecutedTransaction,
  WalletEvent,
  EventHandler 
} from '../types/index.js';
import { encryptionManager } from '../utils/encryption.js';
import { connectionManager } from '../utils/solana.js';
import { logger, auditLog } from '../utils/logger.js';

export interface WalletOptions {
  encryptionPassword: string;
  autoAirdrop?: boolean;
  airdropAmount?: number;
}

export class AgentWallet extends EventEmitter {
  private keypair: Keypair | null = null;
  private config: AgentWalletConfig;
  private encryptionPassword: string;
  private isLocked: boolean = false;
  private transactionHistory: ExecutedTransaction[] = [];
  private eventHandlers: EventHandler[] = [];

  constructor(config: AgentWalletConfig, encryptionPassword: string) {
    super();
    this.config = config;
    this.encryptionPassword = encryptionPassword;

    // If encrypted key provided, decrypt it
    if (config.encryptedPrivateKey) {
      this.loadFromEncryptedKey(config.encryptedPrivateKey);
    }
  }

  /**
   * Create a new wallet
   */
  static async create(
    name: string, 
    encryptionPassword: string,
    options?: WalletOptions
  ): Promise<AgentWallet> {
    logger.info(`Creating new agent wallet: ${name}`);

    // Generate new keypair
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();

    // Encrypt private key
    const secretKey = bs58.encode(keypair.secretKey);
    const encrypted = await encryptionManager.encrypt(secretKey, encryptionPassword);

    const config: AgentWalletConfig = {
      name,
      publicKey,
      encryptedPrivateKey: JSON.stringify(encrypted),
      createdAt: new Date(),
      lastAccessed: new Date(),
      metadata: {
        network: connectionManager.getCurrentNetwork(),
        version: '1.0.0'
      }
    };

    const wallet = new AgentWallet(config, encryptionPassword);
    wallet.keypair = keypair;

    // Request airdrop if on devnet/testnet and autoAirdrop enabled
    if (options?.autoAirdrop && 
        (connectionManager.getCurrentNetwork() === 'devnet' || 
         connectionManager.getCurrentNetwork() === 'testnet')) {
      try {
        await connectionManager.requestAirdrop(
          keypair.publicKey, 
          options.airdropAmount || 2
        );
        logger.info(`Auto-airdropped ${options.airdropAmount || 2} SOL to new wallet`);
      } catch (error) {
        logger.warn('Auto-airdrop failed', { error });
      }
    }

    auditLog('wallet_created', {
      publicKey,
      name,
      network: connectionManager.getCurrentNetwork()
    });

    wallet.emitEvent({
      type: 'wallet_created',
      payload: { publicKey }
    });

    return wallet;
  }

  /**
   * Load wallet from encrypted key
   */
  private async loadFromEncryptedKey(encryptedKey: string): Promise<void> {
    try {
      const encrypted = JSON.parse(encryptedKey);
      const decrypted = await encryptionManager.decrypt(encrypted, this.encryptionPassword);
      const secretKey = bs58.decode(decrypted);
      this.keypair = Keypair.fromSecretKey(secretKey);

      // Verify public key matches
      if (this.keypair.publicKey.toString() !== this.config.publicKey) {
        throw new Error('Public key mismatch - corrupted wallet data');
      }

      this.config.lastAccessed = new Date();
    } catch (error) {
      logger.error('Failed to load wallet', { error, publicKey: this.config.publicKey });
      throw new Error('Failed to decrypt wallet - invalid password');
    }
  }

  /**
   * Unlock wallet (decrypt private key)
   */
  async unlock(password: string): Promise<void> {
    if (this.keypair) {
      return; // Already unlocked
    }

    if (!this.config.encryptedPrivateKey) {
      throw new Error('Wallet has no encrypted key stored');
    }

    const tempPassword = this.encryptionPassword;
    this.encryptionPassword = password;

    try {
      await this.loadFromEncryptedKey(this.config.encryptedPrivateKey);
      this.isLocked = false;
      logger.info(`Wallet unlocked: ${this.config.publicKey}`);
    } catch (error) {
      this.encryptionPassword = tempPassword;
      throw error;
    }
  }

  /**
   * Lock wallet (clear private key from memory)
   */
  lock(): void {
    this.keypair = null;
    this.isLocked = true;

    // Force garbage collection hint (not guaranteed in JS, but good practice)
    if (global.gc) {
      global.gc();
    }

    logger.info(`Wallet locked: ${this.config.publicKey}`);
  }

  /**
   * Get public key
   */
  getPublicKey(): PublicKey {
    return new PublicKey(this.config.publicKey);
  }

  /**
   * Get wallet address (base58)
   */
  getAddress(): string {
    return this.config.publicKey;
  }

  /**
   * Check if wallet is locked
   */
  getLockedStatus(): boolean {
    return this.isLocked || this.keypair === null;
  }

  /**
   * Get wallet config (safe to serialize)
   */
  getConfig(): AgentWalletConfig {
    return { ...this.config };
  }

  /**
   * Get SOL balance
   */
  async getBalance(): Promise<number> {
    return connectionManager.getBalance(this.getPublicKey());
  }

  /**
   * Get all token balances
   */
  async getTokenBalances(): Promise<TokenBalance[]> {
    const connection = connectionManager.getConnection();
    const publicKey = this.getPublicKey();

    try {
      // Get all token accounts
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const balances: TokenBalance[] = [];

      for (const account of tokenAccounts.value) {
        const parsed = account.account.data.parsed;
        const info = parsed.info;

        if (info.tokenAmount.uiAmount > 0) {
          balances.push({
            mint: info.mint,
            symbol: 'UNKNOWN', // Would need token metadata lookup
            decimals: info.tokenAmount.decimals,
            amount: parseInt(info.tokenAmount.amount),
            uiAmount: info.tokenAmount.uiAmount,
            usdValue: undefined // Would need price oracle
          });
        }
      }

      return balances;
    } catch (error) {
      logger.error('Failed to get token balances', { error, publicKey: publicKey.toString() });
      return [];
    }
  }

  /**
   * Get complete wallet balance
   */
  async getWalletBalance(): Promise<WalletBalance> {
    const [sol, tokens] = await Promise.all([
      this.getBalance(),
      this.getTokenBalances()
    ]);

    const balance: WalletBalance = {
      sol,
      tokens,
      lastUpdated: new Date()
    };

    this.emitEvent({
      type: 'balance_updated',
      payload: balance
    });

    return balance;
  }

  /**
   * Sign a transaction (autonomous)
   */
  async signTransaction(
    transaction: Transaction | VersionedTransaction
  ): Promise<Transaction | VersionedTransaction> {
    if (!this.keypair) {
      throw new Error('Wallet is locked - cannot sign transaction');
    }

    try {
      if (transaction instanceof Transaction) {
        transaction.partialSign(this.keypair);
      } else {
        transaction.sign([this.keypair]);
      }

      auditLog('transaction_signed', {
        publicKey: this.config.publicKey,
        signatures: transaction.signatures.map(s => s.publicKey.toString())
      });

      this.emitEvent({
        type: 'transaction_signed',
        payload: { 
          signature: transaction.signatures[0]?.signature?.toString() || 'unknown',
          type: transaction instanceof VersionedTransaction ? 'versioned' : 'legacy'
        }
      });

      return transaction;
    } catch (error) {
      logger.error('Transaction signing failed', { error });
      throw error;
    }
  }

  /**
   * Sign and send transaction
   */
  async signAndSendTransaction(
    transaction: Transaction | VersionedTransaction,
    options?: SendOptions
  ): Promise<ExecutedTransaction> {
    const connection = connectionManager.getConnection();

    // Sign
    const signed = await this.signTransaction(transaction);

    // Serialize
    const raw = signed.serialize();

    // Send
    const signature = await connection.sendRawTransaction(raw, {
      skipPreflight: options?.skipPreflight || false,
      preflightCommitment: options?.preflightCommitment || 'confirmed',
      maxRetries: options?.maxRetries || 3
    });

    logger.info(`Transaction sent: ${signature}`);

    // Confirm
    try {
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      const executed: ExecutedTransaction = {
        signature,
        status: 'confirmed',
        slot: confirmation.context.slot,
        timestamp: new Date(),
        fee: 0 // Would need to fetch actual fee
      };

      this.transactionHistory.push(executed);

      auditLog('transaction_confirmed', {
        signature,
        slot: confirmation.context.slot,
        publicKey: this.config.publicKey
      });

      this.emitEvent({
        type: 'transaction_confirmed',
        payload: { signature, slot: confirmation.context.slot }
      });

      return executed;
    } catch (error) {
      const failed: ExecutedTransaction = {
        signature,
        status: 'failed',
        slot: 0,
        timestamp: new Date(),
        fee: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      this.transactionHistory.push(failed);

      auditLog('transaction_failed', {
        signature,
        error: failed.error,
        publicKey: this.config.publicKey
      }, 'warning');

      this.emitEvent({
        type: 'transaction_failed',
        payload: { signature, error: failed.error }
      });

      throw error;
    }
  }

  /**
   * Transfer SOL
   */
  async transferSol(
    recipient: string, 
    amountSol: number
  ): Promise<ExecutedTransaction> {
    const connection = connectionManager.getConnection();
    const recipientPubkey = new PublicKey(recipient);
    const lamports = amountSol * LAMPORTS_PER_SOL;

    // Create transfer instruction
    const instruction = SystemProgram.transfer({
      fromPubkey: this.getPublicKey(),
      toPubkey: recipientPubkey,
      lamports
    });

    // Create transaction
    const transaction = new Transaction().add(instruction);

    // Get recent blockhash
    const { blockhash } = await connectionManager.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.getPublicKey();

    // Sign and send
    return this.signAndSendTransaction(transaction);
  }

  /**
   * Transfer SPL tokens
   */
  async transferToken(
    tokenMint: string,
    recipient: string,
    amount: number
  ): Promise<ExecutedTransaction> {
    const connection = connectionManager.getConnection();
    const mintPubkey = new PublicKey(tokenMint);
    const recipientPubkey = new PublicKey(recipient);
    const senderPubkey = this.getPublicKey();

    // Get associated token addresses
    const senderTokenAccount = await getAssociatedTokenAddress(mintPubkey, senderPubkey);
    const recipientTokenAccount = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

    const transaction = new Transaction();

    // Check if recipient token account exists
    const recipientAccount = await connection.getAccountInfo(recipientTokenAccount);
    if (!recipientAccount) {
      // Create associated token account for recipient
      transaction.add(
        createAssociatedTokenAccountInstruction(
          senderPubkey,
          recipientTokenAccount,
          recipientPubkey,
          mintPubkey
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        senderTokenAccount,
        recipientTokenAccount,
        senderPubkey,
        amount
      )
    );

    // Get recent blockhash
    const { blockhash } = await connectionManager.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;

    return this.signAndSendTransaction(transaction);
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(): ExecutedTransaction[] {
    return [...this.transactionHistory];
  }

  /**
   * Export wallet (encrypted)
   */
  export(): AgentWalletConfig {
    return {
      ...this.config,
      lastAccessed: new Date()
    };
  }

  /**
   * Subscribe to events
   */
  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Emit event to all handlers
   */
  private emitEvent(event: WalletEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        logger.error('Event handler failed', { error });
      }
    });
  }

  /**
   * Secure wipe (for wallet deletion)
   */
  secureWipe(): void {
    this.keypair = null;
    this.config.encryptedPrivateKey = undefined;
    this.transactionHistory = [];
    this.isLocked = true;

    if (global.gc) {
      global.gc();
    }

    auditLog('wallet_wiped', {
      publicKey: this.config.publicKey
    });
  }
}

export default AgentWallet;
