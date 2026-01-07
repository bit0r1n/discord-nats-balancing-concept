## Commands service
This service listens for Discord `INTERACTION_CREATE` and `MESSAGE_CREATE` events from the NATS server to processes slash and text commands.

### Environment variables
- `NATS_URL`: The NATS server URL (e.g. `nats://localhost:4222`).
- `NATS_MODE`: The NATS mode, either `js` for JetStream or `core` for core.
- `REDIS_URL`: The Redis server URL (e.g. `redis://localhost:6379`).
- `DISCORD_TOKEN`: The Discord bot token.
- `DISCORD_API_URL`: (Optional) Custom Discord API URL.
- `DISCORD_DEBUG_GUILD_ID`: (Optional) If set, registers slash command only in this guild for test.
