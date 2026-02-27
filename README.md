# 🤖 Solana Agentic Wallet

A production-ready autonomous wallet system for AI agents on Solana. Enables AI agents to independently manage funds, execute trades, and interact with DeFi protocols while maintaining strict security and policy controls.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-Devnet-blue)](https://solana.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

## ✨ Features

### Core Capabilities
- **🔐 Secure Wallet Management**: AES-256-GCM encrypted key storage with PBKDF2 key derivation
- **🤖 Autonomous Transaction Signing**: Agents can sign transactions without human intervention
- **📊 Multi-Agent Orchestration**: Run multiple independent agents with separate wallets
- **🛡️ Policy Engine**: Fine-grained access controls and risk management
- **🔄 DeFi Integration**: Test integration with Jupiter/Raydium protocols
- **📈 Trading Strategies**: Built-in trend following, mean reversion, and DCA strategies

### Security Features
- Encrypted private key storage (never plaintext)
- Policy-based transaction validation
- Rate limiting and amount restrictions
- Token whitelisting
- Comprehensive audit logging
- Emergency stop functionality

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Solana CLI (optional, for devnet)

### Installation

```bash
# Clone the repository
git clone https://github.com/Demian091/solana-agent-wallet.git
cd solana-agentic-wallet

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# For devnet testing, defaults are fine
```

### Running the Demo

```bash
# Run the automated demo
npm run dev

# Or start interactive CLI
npm run agent interactive
```

## 📖 Usage

### Creating an Agent Wallet

```typescript
import { AgentWallet } from './src/index.js';

// Create new wallet
const wallet = await AgentWallet.create('my-agent', 'secure-password', {
  autoAirdrop: true,      // Request devnet SOL
  airdropAmount: 2        // 2 SOL
});

console.log('Address:', wallet.getAddress());
console.log('Balance:', await wallet.getBalance());
```

### Creating a Trading Agent

```typescript
import { MultiAgentOrchestrator, TradingStrategy } from './src/index.js';

const orchestrator = new MultiAgentOrchestrator();

const strategy: TradingStrategy = {
  name: 'trend_following',
  parameters: {
    targetToken: 'SOL',
    baseToken: 'USDC',
    tradeAmount: 0.1,
    maxSlippage: 50,
    stopLoss: 0.05,
    takeProfit: 0.1
  }
};

const agent = await orchestrator.createTradingAgent(
  'trend-follower',
  strategy,
  'wallet-password'
);

// Start the agent
await orchestrator.startAgent(agent.id);
```

### Executing Swaps

```typescript
import { testDeFiProtocol } from './src/index.js';

// Get quote
const quote = await testDeFiProtocol.getSwapQuote(
  'SOL',
  'USDC',
  0.1  // 0.1 SOL
);

// Execute swap
const signature = await testDeFiProtocol.executeSwap(wallet, quote);
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Multi-Agent Orchestrator                  │
│                   (Agent Lifecycle Management)               │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
      ┌────────▼────────┐            ┌───────▼────────┐
      │  Trading Agent  │            │  Trading Agent │
      │  (Trend Follow) │            │  (Mean Revert) │
      └────────┬────────┘            └───────┬────────┘
               │                              │
      ┌────────▼────────┐            ┌───────▼────────┐
      │  Agent Wallet   │            │  Agent Wallet  │
      │  (Encrypted)    │            │  (Encrypted)   │
      └────────┬────────┘            └───────┬────────┘
               │                              │
      ┌────────▼──────────────────────────────▼────────┐
      │              Policy Engine                      │
      │  (Amount Limits, Token Whitelist, Rate Limits)  │
      └────────┬──────────────────────────────┬─────────┘
               │                              │
      ┌────────▼────────┐            ┌───────▼────────┐
      │   Solana RPC    │            │  Test DeFi     │
      │   (Devnet)      │            │  Protocol      │
      └─────────────────┘            └────────────────┘
```

## 🛡️ Security Considerations

### Key Management
- Private keys are encrypted using AES-256-GCM
- Keys are only decrypted in memory when needed
- Automatic memory clearing after operations
- Support for hardware wallet integration (future)

### Policy Controls
```typescript
// Example: Strict policy configuration
const policyEngine = new PolicyEngine();

policyEngine.addPolicy({
  id: 'max-transaction',
  name: 'Max Transaction Size',
  conditions: [{
    type: 'amount_limit',
    params: { maxAmountSol: 1.0 },
    operator: 'and'
  }],
  action: 'deny',
  priority: 100,
  enabled: true
});
```

### Audit Logging
All actions are logged to `logs/`:
- `agent.json`: General agent activity
- `security.json`: Security events
- `error.json`: Error tracking

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run demo
npm run demo
```

## 📝 CLI Commands

```bash
# Initialize system
npm run agent init

# Create new agent
npm run agent create-agent --name "my-trader" --strategy trend_following

# List all agents
npm run agent list

# Start/stop agents
npm run agent start <agent-id>
npm run agent stop <agent-id>

# Check balance
npm run agent balance <agent-id>

# Execute swap
npm run agent swap <agent-id> --from SOL --to USDC --amount 0.1

# Show pools
npm run agent pools

# Generate report
npm run agent report

# Interactive mode
npm run agent interactive
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLANA_RPC_URL` | RPC endpoint | `https://api.devnet.solana.com` |
| `SOLANA_COMMITMENT` | Confirmation level | `confirmed` |
| `ENCRYPTION_KEY` | Master encryption key | Required |
| `MAX_TRANSACTION_AMOUNT_SOL` | Max TX size | `1.0` |
| `ALLOWED_TOKENS` | Comma-separated mints | `SOL,USDC` |
| `LOG_LEVEL` | Logging level | `info` |

### Policy Configuration

Policies can be customized in `src/policies/PolicyEngine.ts`:

- **Amount Limits**: Per-transaction and daily volume caps
- **Token Whitelist**: Restrict to specific tokens
- **Time Windows**: Restrict trading hours
- **Rate Limiting**: Max transactions per minute
- **Custom Rules**: Implement custom validation logic

## 📚 Documentation

- [Architecture Deep Dive](./docs/ARCHITECTURE.md)
- [Security Best Practices](./docs/SECURITY.md)
- [API Reference](./docs/API.md)
- [Agent Development Guide](./docs/AGENTS.md)

## 🚧 Roadmap

- [ ] Mainnet support with hardware wallet integration
- [ ] TEE (Trusted Execution Environment) support
- [ ] Multi-signature agent wallets
- [ ] Advanced ML-based trading strategies
- [ ] Cross-chain agent coordination
- [ ] Governance token integration

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

**This is experimental software for development and testing purposes only.**

- Only use on devnet/testnet
- Do not use with real funds
- Agents can lose money - implement proper risk management
- Always review and test policies before deployment

## 🙏 Acknowledgments

- Solana Labs for the excellent web3.js library
- Jupiter Aggregator for DEX integration patterns
- Helius for RPC infrastructure guidance

---

Built with ❤️ for the Solana AI Agent Hackathon
