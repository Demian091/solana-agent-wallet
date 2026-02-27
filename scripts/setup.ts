#!/usr/bin/env tsx
/**
 * Setup Script - Initialize development environment
 */

import fs from 'fs/promises';
import path from 'path';

async function setup() {
  console.log('🔧 Setting up Agentic Wallet...\n');

  // Create directories
  const dirs = ['logs', 'wallets', 'data'];
  for (const dir of dirs) {
    await fs.mkdir(path.join(process.cwd(), dir), { recursive: true });
  }
  console.log('✅ Directories created');

  // Check .env
  try {
    await fs.access('.env');
    console.log('✅ .env exists');
  } catch {
    await fs.copyFile('.env.example', '.env');
    console.log('✅ .env created from template');
    console.log('⚠️  Please edit .env with your configuration');
  }

  console.log('\n🎉 Setup complete!');
  console.log('\nNext steps:');
  console.log('  1. Edit .env with your settings');
  console.log('  2. Run: npm run dev');
  console.log('  3. Or: npm run agent interactive');
}

setup().catch(console.error);
