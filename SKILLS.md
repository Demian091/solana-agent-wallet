# Agent Skills Documentation

## Core Capabilities

### Wallet Management
- `wallet.create` - Create encrypted wallet
- `wallet.unlock` - Decrypt and access
- `wallet.lock` - Secure wallet
- `balance.get` - Check SOL and tokens
- `transfer.sol` - Send SOL
- `transfer.token` - Send SPL tokens

### Trading
- `swap.quote` - Get Jupiter-style quote
- `swap.execute` - Execute swap
- `liquidity.add` - Provide liquidity
- `pools.list` - View pools
- `price.get` - Token prices

### Strategies
- `strategy.trend` - Trend following
- `strategy.mean` - Mean reversion
- `strategy.dca` - Dollar cost averaging
- `position.track` - Monitor positions

### Policies
- `policy.check` - Validate transaction
- `risk.assess` - Calculate risk score

### Multi-Agent
- `agent.create` - Spawn agent
- `agent.start` - Begin execution
- `agent.monitor` - Track performance

## Example Usage

```typescript
// Create wallet
const wallet = await AgentWallet.create('bot', 'pass', { autoAirdrop: true });

// Create agent
const agent = await orchestrator.createTradingAgent(
  'trader',
  { name: 'trend_following', parameters: { targetToken: 'SOL', tradeAmount: 0.1 } },
  'pass'
);

// Start
await orchestrator.startAgent(agent.id);
```

## Security
- Never log private keys
- Always check policies
- Use stop-losses
- Monitor error rates
