## Discord bot with services architecture
This repository contains a simple Discord bot implemented with a services architecture using NATS as the message broker and Redis for caching.
Each service is responsible for a specific functionality, allowing for better scalability and maintainability.

### Services
- [**Gateway service**](/src/gateway/): Connects to the Discord Gateway, listens for events, republishes them to NATS, and caches Discord entities in Redis.
- [**Commands service**](/src/commands/): Listens for Discord `INTERACTION_CREATE` and `MESSAGE_CREATE` events from NATS to process slash and text commands.

Little bit more info about each service can be found in their respective folders.

Base docker compose setup, which requires only `DISCORD_TOKEN` environment variable and enabled `MESSAGE_CONTENT` privileged intent to run the bot, is provided in [`docker-compose.yml`](/docker-compose.yml) file.