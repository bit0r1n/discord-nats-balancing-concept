import {
  InteractionResponseTypes,
  InteractionTypes,
  type RawApplicationCommandInteractionData,
  type RawInteraction,
  type RawMessage,
  type RawRole,
} from 'oceanic.js'
import { type GatewayPayload, type ShardsMetricsResponse } from '../shared/interfaces.js'
import { buildRoleKey } from '../shared/key.helper.js'
import { broadcastRequest } from '../shared/nats.helper.js'
import { InternalSubjects } from '../shared/constants.js'
import { type HandlerContext } from './commands.interfaces.js'

export async function handleMessage(context: HandlerContext, payload: GatewayPayload<RawMessage>) {
  const { nats, redis, discord } = context
  const message = payload.data

  if (message.author.bot || !message.guild_id) return
  if (!message.content.startsWith(';')) return

  const [ command, ...args ] = message.content.slice(1).trim().split(/\s+/)

  switch (command.toLowerCase()) {
    case 'test': {
      const natsLatency = Date.now() - payload.received_at
      
      const authorRoles = message.member!.roles
      const rawRoles = await redis.mGet(authorRoles.map((r) => buildRoleKey(r)))
      const roles = rawRoles.filter(Boolean).map((r) => JSON.parse(r!) as RawRole)

      await discord.rest.channels.createMessage(message.channel_id, {
        content: `Hello from commands service \`service pid ${process.pid}\`. `
        + `Received event from gateway service \`shard #${payload.shard_id}\` via NATS орешки. `
        + `It took \`${natsLatency}ms\` to receive event.\n`
        + (roles.length ? `btw, your roles are: \`${roles.map((r) => r.name).join(', ')}\`` : 'btw, you have no roles.'),
      })
      break
    }
    // case 'eval': {
    //   const code = args.join(' ')
    //   try {
    //     const result = await eval(code)
    //     await discord.rest.channels.createMessage(message.channel_id, {
    //       content: `\`\`\`js\n${String(inspect(result, { depth: 0 })).slice(0, 1990)}\n\`\`\``,
    //     })
    //   } catch (err) {
    //     await discord.rest.channels.createMessage(message.channel_id, {
    //       content: `\`\`\`js\n${String(err).slice(0, 1990)}\n\`\`\``,
    //     })
    //   }
    //   break
    // }
    case 'guilds': {
      const shardsMetrics = await broadcastRequest<ShardsMetricsResponse>(nats, InternalSubjects.ShardsMetrics)
      const totalGuilds = shardsMetrics.reduce((acc, resp) => {
        return acc + resp.shards.reduce((acc, v) => acc + v.guilds_count, 0)
      }, 0)

      await discord.rest.channels.createMessage(message.channel_id, {
        content: `Current total guilds across all shards: \`${totalGuilds}\``,
      })
      break
    }
  }
}

export async function handleInteraction(context: HandlerContext, payload: GatewayPayload<RawInteraction>) {
  const { nats, redis, discord } = context
  const interaction = payload.data

  if (interaction.type !== InteractionTypes.APPLICATION_COMMAND) return

  // in real use it's probably better to defer all interactions first
  // since there are only 3000ms to respond and some time is cut by NATS transit
  // await discord.rest.interactions.createInteractionResponse(
  //   interaction.id,
  //   interaction.token,
  //   {
  //     type: InteractionResponseTypes.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  //   }
  // )

  await discord.rest.interactions.createInteractionResponse(
    interaction.id,
    interaction.token,
    {
      type: InteractionResponseTypes.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `You have executed \`${(interaction.data as RawApplicationCommandInteractionData).name}\` command`
      }
    }
  )
}
