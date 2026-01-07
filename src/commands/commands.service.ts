import {
  ApplicationCommandTypes,
  Client as OceanicClient,
  type RawInteraction,
  type RawMessage,
} from 'oceanic.js'
import { connect } from 'nats'
import { createClient } from 'redis'

import { type GatewayPayload } from '../shared/interfaces.js'
import { NatsMode } from '../shared/constants.js'
import { buildEventSubject } from '../shared/nats.helper.js'
import { handleInteraction, handleMessage } from './commands.handlers.js'
import { type HandlerContext } from './commands.interfaces.js'

const streamName = 'DISCORD'
const serviceName = 'commands-service'
const messageSubject = buildEventSubject('MESSAGE_CREATE')
const interactionSubject = buildEventSubject('INTERACTION_CREATE')

const natsServer = process.env['NATS_URL']
const natsMode = process.env['NATS_MODE'] === 'js' ? NatsMode.JetStream : NatsMode.Core

const redisUrl = process.env['REDIS_URL']

const discordToken = process.env['DISCORD_TOKEN']
const discordAPIUrl = process.env['DISCORD_API_URL']
const discordDebugGuildId = process.env['DISCORD_DEBUG_GUILD_ID']

const redis = createClient({
  url: redisUrl,
})
await redis.connect()
console.log('Connected to Redis')

const discord = new OceanicClient({
  auth: 'Bot ' + discordToken,
  rest: {
    baseURL: discordAPIUrl,
  },
})
await discord.restMode()
console.log('Discord client is ready in REST mode')

if (discordDebugGuildId) {
  await discord.rest.applications.createGuildCommand(
    discord.application.id,
    discordDebugGuildId,
    {
      name: 'test-inter',
      description: 'jolly command',
      type: ApplicationCommandTypes.CHAT_INPUT,
    }
  )
  console.log('Registered "test-inter" command for test guild')
}

const nats = await connect({ servers: natsServer })
const jetstream = nats.jetstream()
console.log('Connected to NATS server')

const handlerContext: HandlerContext = {
  nats,
  redis,
  discord,
}

if (natsMode === NatsMode.JetStream) {
  console.log('Using NATS JetStream mode')

  const messageConsumer = await jetstream.consumers.get(
    streamName,
    serviceName,
  )
  await messageConsumer.consume({
    callback: (msg) => {
      const packet = msg.json<GatewayPayload<RawMessage | RawInteraction>>()
      if (packet.topic === messageSubject) {
        handleMessage(handlerContext, packet as GatewayPayload<RawMessage>).catch(console.error)
      } else if (packet.topic === interactionSubject) {
        handleInteraction(handlerContext, packet as GatewayPayload<RawInteraction>).catch(console.error)
      }
      msg.ack()
    }
  })
} else {
  console.log('Using NATS Core mode')

  nats.subscribe(messageSubject, {
    queue: serviceName,
    callback: (err, msg) => {
      if (err) {
        console.error('Error receiving NATS Core message:', err)
        return
      }
      const packet = msg.json<GatewayPayload<RawMessage>>()
      handleMessage(handlerContext, packet).catch(console.error)
    }
  })

  nats.subscribe(interactionSubject, {
    queue: serviceName,
    callback: (err, msg) => {
      if (err) {
        console.error('Error receiving NATS Core interaction:', err)
        return
      }
      const packet = msg.json<GatewayPayload<RawInteraction>>()
      handleInteraction(handlerContext, packet).catch(console.error)
    }
  })
}
