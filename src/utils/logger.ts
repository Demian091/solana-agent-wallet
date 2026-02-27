/**
 * Winston-based Logger for Agentic Wallet
 * Provides structured logging with security audit trails
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const { combine, timestamp, json, errors, printf } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { 
    service: 'agentic-wallet',
    environment: process.env.NODE_ENV || 'development'
  },
  format: combine(
    timestamp(),
    errors({ stack: true })
  ),
  transports: [
    // Console output for development
    new winston.transports.Console({
      format: combine(
        timestamp(),
        consoleFormat
      )
    }),
    // JSON logs for production/analysis
    new winston.transports.File({
      filename: path.join(logsDir, 'agent.json'),
      format: json()
    }),
    // Security audit log
    new winston.transports.File({
      filename: path.join(logsDir, 'security.json'),
      level: 'warn',
      format: json()
    }),
    // Error log
    new winston.transports.File({
      filename: path.join(logs_dir, 'error.json'),
      level: 'error',
      format: json()
    })
  ]
});

// Security audit helper
export const auditLog = (event: string, details: Record<string, any>, severity: 'info' | 'warning' | 'critical' = 'info') => {
  const logEntry = {
    type: 'security_audit',
    event,
    severity,
    details,
    timestamp: new Date().toISOString()
  };

  if (severity === 'critical') {
    logger.error('SECURITY_AUDIT', logEntry);
  } else if (severity === 'warning') {
    logger.warn('SECURITY_AUDIT', logEntry);
  } else {
    logger.info('SECURITY_AUDIT', logEntry);
  }
};

export default logger;
