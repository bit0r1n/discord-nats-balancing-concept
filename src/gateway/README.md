## Gateway service
This service connects to the Discord Gateway and listens for events. It then republishes these events to a NATS server for other services to consume. Also it caches Discord entities in Redis for quick access by other services.

### Environment variables
- `NATS_URL`: The NATS server URL (e.g. `nats://localhost:4222`).
- `NATS_MODE`: The NATS mode, either `js` for JetStream or `core` for core NATS.
- `REDIS_URL`: The Redis server URL (e.g. `redis://localhost:6379`).
- `DISCORD_EVENTS_LISTEN`: A comma-separated list of Discord events to broadcast in NATS (e.g. `GUILD_CREATE,MESSAGE_CREATE`).
- `DISCORD_TOKEN`: The Discord bot token.
- `DISCORD_API_URL`: (Optional) Custom Discord API URL.
- `DISCORD_GATEWAY_INTENTS`: (Optional) Comma-separated list of Gateway Intents to use (e.g. `GUILDS,GUILD_MESSAGES`).
- `DISCORD_MAX_SHARDS`: (Optional) Maximum number of shards to use.
- `DISCORD_FIRST_SHARD_ID`: (Optional) First shard ID to use.
- `DISCORD_LAST_SHARD_ID`: (Optional) Last shard ID to use.
