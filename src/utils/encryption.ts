/**
 * Encryption Utilities for Agentic Wallet
 * Implements AES-256-GCM for secure key storage
 * Uses PBKDF2 for key derivation from passwords
 */

import * as crypto from 'crypto';
import { promisify } from 'util';
import { logger } from './logger.js';

const scrypt = promisify(crypto.scrypt);

export interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
  tag: string;
  algorithm: string;
}

export class EncryptionManager {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly saltLength = 32;
  private readonly tagLength = 16;
  private readonly iterations = 100000;

  /**
   * Encrypt sensitive data (private keys, seeds)
   */
  async encrypt(data: string, password: string): Promise<EncryptedData> {
    try {
      // Generate salt and derive key
      const salt = crypto.randomBytes(this.saltLength);
      const key = await scrypt(password, salt, this.keyLength) as Buffer;

      // Generate IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      // Encrypt
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get auth tag
      const tag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        tag: tag.toString('hex'),
        algorithm: this.algorithm
      };
    } catch (error) {
      logger.error('Encryption failed', { error });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  async decrypt(encryptedData: EncryptedData, password: string): Promise<string> {
    try {
      // Reconstruct buffers
      const salt = Buffer.from(encryptedData.salt, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');

      // Derive key
      const key = await scrypt(password, salt, this.keyLength) as Buffer;

      // Create decipher
      const decipher = crypto.createDecipheriv(encryptedData.algorithm, key, iv);
      decipher.setAuthTag(tag);

      // Decrypt
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Decryption failed', { error });
      throw new Error('Failed to decrypt data - invalid password or corrupted data');
    }
  }

  /**
   * Generate a secure random encryption key
   */
  generateSecureKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  /**
   * Hash a password for storage (for agent authentication)
   */
  async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Verify a password against stored hash
   */
  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [salt, hash] = storedHash.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  }

  /**
   * Rotate encryption key (re-encrypt with new password)
   */
  async rotateKey(encryptedData: EncryptedData, oldPassword: string, newPassword: string): Promise<EncryptedData> {
    const decrypted = await this.decrypt(encryptedData, oldPassword);
    return this.encrypt(decrypted, newPassword);
  }
}

// Singleton instance
export const encryptionManager = new EncryptionManager();
