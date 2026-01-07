import {
  Client as OceanicClient,
  GatewayOPCodes,
  type RawGuild,
  type RawUnavailableGuild,
  type IntentNames,
} from 'oceanic.js'
import { connect, JSONCodec } from 'nats'
import { createClient } from 'redis'

import {
  buildChannelKey,
  buildGuildChannelsSetKey,
  buildGuildKey, buildGuildMembersSetKey, buildGuildRolesSetKey,
  buildGuildThreadsSetKey, buildMemberKey, buildRoleKey,
  buildThreadKey,
  buildUserKey,
} from '../shared/key.helper.js'
import { InternalSubjects, NatsMode } from '../shared/constants.js'
import { buildEventSubject } from '../shared/nats.helper.js'

type RawGuildOptionalCache = Omit<RawGuild, 'channels' | 'threads' | 'members' | 'roles' | 'emojis'>
  & Partial<Pick<RawGuild, 'channels' | 'threads' | 'members' | 'roles' | 'emojis'>>

// variables initialization
const natsServer = process.env['NATS_URL']
const natsMode = process.env['NATS_MODE'] === 'js' ? NatsMode.JetStream : NatsMode.Core

const redisUrl = process.env['REDIS_URL']

const eventsToListen = process.env['DISCORD_EVENTS_LISTEN']?.split(',') || []
const discordToken = process.env['DISCORD_TOKEN']
const discordAPIUrl = process.env['DISCORD_API_URL']
const discordIntents = process.env['DISCORD_GATEWAY_INTENTS']?.split(',') as IntentNames[] | undefined
const maxShards = Number(process.env['DISCORD_MAX_SHARDS'])
const firstShardId = Number(process.env['DISCORD_FIRST_SHARD_ID'])
const lastShardId = Number(process.env['DISCORD_LAST_SHARD_ID'])

// nats
const nats = await connect({
  servers: natsServer,
})
const jetstream = nats.jetstream()
const codec = JSONCodec()
console.log('Connected to NATS server')
console.log(`Using NATS ${natsMode === NatsMode.JetStream ? 'JetStream' : 'Core'} mode`)

// redis
const redis = createClient({
  url: redisUrl,
})
await redis.connect()
console.log('Connected to Redis')

// discord gateway
const bot = new OceanicClient({
  auth: 'Bot ' + discordToken,
  gateway: {
    intents: discordIntents || [ 'GUILDS' ],
    maxShards: isNaN(maxShards) ? 'auto' : maxShards,
    firstShardID: isNaN(firstShardId) ? undefined : firstShardId,
    lastShardID: isNaN(lastShardId) ? undefined : lastShardId,
  },
  rest: {
    baseURL: discordAPIUrl,
  },
  collectionLimits: {
    auditLogEntries: 0,
    autoModerationRules: 0,
    channels: 0,
    emojis: 0,
    groupChannels: 0,
    guildThreads: 0,
    integrations: 0,
    invites: 0,
    members: 0,
    messages: 0,
    privateChannels: 0,
    roles: 0,
    scheduledEvents: 0,
    soundboardSounds: 0,
    stageInstances: 0,
    stickers: 0,
    users: 0,
    voiceMembers: 0,
    voiceStates: 0,
  }
})

// handle metrics request
nats.subscribe(InternalSubjects.ShardsMetrics, {
  callback: (err, msg) => {
    if (err) {
      console.error('Error receiving shards metrics request:', err)
      return
    }

    msg.respond(codec.encode({
      shards: bot.shards.map(shard => ({
        id: shard.id,
        guilds_count: bot.guilds.filter(g => g.shard.id === shard.id).length,
        status: shard.status,
        latency: shard.latency,
      })),
      instance_ready: bot.ready,
    }))
  }
})

// gateway listener
bot.on('packet', async (packet, shardId) => {
  if (packet.op !== GatewayOPCodes.DISPATCH) return

  const eventName = packet.t

  // broadcast event
  if (eventsToListen.includes(eventName)) {
    if (eventName === 'GUILD_CREATE' && !bot.ready) return // initial guilds loading

    const payload = codec.encode({
      shard_id: shardId,
      topic: packet.t,
      data: packet.d,
      received_at: Date.now(),
    })
    const subject = buildEventSubject(eventName)

    if (natsMode === NatsMode.JetStream) {
      jetstream.publish(subject, payload).catch(console.error)
    } else {
      nats.publish(subject, payload)
    }
  }

  // sync cache
  switch (eventName) {
    case 'GUILD_UPDATE':
    case 'GUILD_CREATE': {
      const data = { ...packet.d } as RawUnavailableGuild | RawGuildOptionalCache
      if (data.unavailable === true) break // it's just { id, unavailable: true }, so will overwrite normal guild data

      const guildId = data.id
      const promises = []

      for (const channel of data.channels || []) {
        promises.push(
          redis.set(buildChannelKey(channel.id), JSON.stringify(channel)),
          redis.sAdd(buildGuildChannelsSetKey(guildId), channel.id)
        )
      }
      
      delete data.channels

      for (const thread of data.threads || []) {
        promises.push(
          redis.set(buildThreadKey(thread.id), JSON.stringify(thread)),
          redis.sAdd(buildGuildThreadsSetKey(guildId), thread.id)
        )
      }

      delete data.threads

      for (const member of data.members || []) {
        promises.push(
          redis.set(buildMemberKey(guildId, member.user!.id), JSON.stringify(member)),
          redis.sAdd(buildGuildMembersSetKey(guildId), member.user!.id),
          redis.set(buildUserKey(member.user!.id), JSON.stringify(member.user!)),
        )
      }

      delete data.members

      for (const role of data.roles || []) {
        promises.push(
          redis.set(buildRoleKey(role.id), JSON.stringify(role)),
          redis.sAdd(buildGuildRolesSetKey(guildId), role.id)
        )
      }

      delete data.roles

      delete data.emojis
      delete data.stickers

      promises.push(redis.set(buildGuildKey(guildId), JSON.stringify(data)))

      await Promise.all(promises)
      break
    }
    case 'GUILD_DELETE': {
      if (packet.d.unavailable === true) break
      const guildId = packet.d.id

      const channelsKey = buildGuildChannelsSetKey(guildId)
      const threadsKey = buildGuildThreadsSetKey(guildId)
      const membersKey = buildGuildMembersSetKey(guildId)
      const rolesKey = buildGuildRolesSetKey(guildId)

      const [ channelIds, threadIds, membersIds, rolesIds ] = await Promise.all([
        redis.sMembers(channelsKey),
        redis.sMembers(threadsKey),
        redis.sMembers(membersKey),
        redis.sMembers(rolesKey),
      ])

      const deletionsPromises = []

      for (const id of channelIds) {
        deletionsPromises.push(redis.del(buildChannelKey(id)))
      }

      for (const id of threadIds) {
        deletionsPromises.push(redis.del(buildThreadKey(id)))
      }

      for (const id of membersIds) {
        deletionsPromises.push(redis.del(buildMemberKey(guildId, id)))
      }

      for (const id of rolesIds) {
        deletionsPromises.push(redis.del(buildRoleKey(id)))
      }

      deletionsPromises.push(
        redis.del([
          buildGuildKey(guildId),
          channelsKey,
          threadsKey,
          membersKey,
          rolesKey,
        ])
      )

      await Promise.all(deletionsPromises)
      break
    }

    case 'CHANNEL_UPDATE':
    case 'CHANNEL_CREATE': {
      const channelId = packet.d.id

      const promises = []
      if (eventName === 'CHANNEL_CREATE' && 'guild_id' in packet.d) {
        promises.push(redis.sAdd(buildGuildChannelsSetKey(packet.d.guild_id), channelId))
      }
      promises.push(redis.set(buildChannelKey(packet.d.id), JSON.stringify(packet.d)))

      await Promise.all(promises)
      break
    }
    case 'CHANNEL_DELETE': {
      const channelId = packet.d.id

      const promises = []
      if ('guild_id' in packet.d) {
        promises.push(redis.sRem(buildGuildChannelsSetKey(packet.d.guild_id), channelId))
      }
      promises.push(redis.del(buildChannelKey(channelId)))

      await Promise.all(promises)
      break
    }

    case 'THREAD_CREATE':
    case 'THREAD_UPDATE': {
      const threadId = packet.d.id
      const promises = [
        redis.sAdd(buildGuildThreadsSetKey(packet.d.guild_id), threadId),
        redis.set(buildThreadKey(threadId), JSON.stringify(packet.d)),
      ]

      await Promise.all(promises)
      break
    }
    case 'THREAD_DELETE': {
      const threadId = packet.d.id
      const promises = [
        redis.sRem(buildGuildThreadsSetKey(packet.d.guild_id), threadId),
        redis.del(buildThreadKey(threadId)),
      ]

      await Promise.all(promises)
      break
    }
    
    case 'THREAD_LIST_SYNC': {
      const guildId = packet.d.guild_id
      const promises = []

      for (const thread of packet.d.threads) {
        promises.push(
          redis.set(buildThreadKey(thread.id), JSON.stringify(thread)),
          redis.sAdd(buildGuildThreadsSetKey(guildId), thread.id)
        )
      }

      // thread members?

      await Promise.all(promises)
      break
    }
    // thread member update/thread members update

    case 'GUILD_MEMBER_UPDATE':
    case 'GUILD_MEMBER_ADD': {
      const guildId = packet.d.guild_id
      // user is empty only for message create/update events
      const user = packet.d.user!
      const memberId = user.id

      const promises = []

      promises.push(
        redis.set(buildMemberKey(guildId, memberId), JSON.stringify(packet.d)),
        redis.set(buildUserKey(memberId), JSON.stringify(user)),
      )

      if (eventName === 'GUILD_MEMBER_ADD') {
        promises.push(
          redis.sAdd(buildGuildMembersSetKey(guildId), memberId),
        )
      }

      await Promise.all(promises)
      break
    }

    case 'GUILD_MEMBER_REMOVE': {
      const guildId = packet.d.guild_id
      const memberId = packet.d.user!.id

      const promises = [
        redis.del(buildMemberKey(guildId, memberId)),
        redis.sRem(buildGuildMembersSetKey(guildId), memberId),
      ]

      await Promise.all(promises)
      break
    }

    case 'GUILD_ROLE_CREATE':
    case 'GUILD_ROLE_UPDATE': {
      const roleId = packet.d.role.id
      const guildId = packet.d.guild_id

      const promises = []

      promises.push(redis.set(buildRoleKey(roleId), JSON.stringify(packet.d.role)))

      if (eventName === 'GUILD_ROLE_CREATE') {
        promises.push(
          redis.sAdd(buildGuildRolesSetKey(guildId), roleId),
        )
      }

      await Promise.all(promises)
      break
    }

    case 'GUILD_ROLE_DELETE': {
      const roleId = packet.d.role_id
      const guildId = packet.d.guild_id

      const promises = [
        redis.del(buildRoleKey(roleId)),
        redis.sRem(buildGuildRolesSetKey(guildId), roleId),
      ]

      await Promise.all(promises)
      break
    }
    case 'USER_UPDATE': {
      const user = packet.d
      const userId = user.id

      await redis.set(buildUserKey(userId), JSON.stringify(user))
      break
    }

    // side sync cache (members, users) from related events
    case 'MESSAGE_UPDATE':
    case 'MESSAGE_CREATE': {
      const user = packet.d.author
      const member = packet.d.member
      const guildId = packet.d.guild_id

      const promises = []

      if (user) {
        const userId = user.id
        promises.push(
          redis.set(buildUserKey(userId), JSON.stringify(user)),
        )

        if (guildId && member) {
          promises.push(
            redis.set(buildMemberKey(guildId, userId), JSON.stringify(member)),
            redis.sAdd(buildGuildMembersSetKey(guildId), userId),
          )
        }
      }

      for (const user of packet.d.mentions || []) {
        const userId = user.id
        promises.push(
          redis.set(buildUserKey(userId), JSON.stringify(user)),
        )

        if (guildId && user.member) {
          redis.sAdd(buildGuildMembersSetKey(guildId), userId)
          promises.push(
            redis.set(buildMemberKey(guildId, userId), JSON.stringify(user.member)),
          )
        }
      }

      await Promise.all(promises)
      break
    }
    case 'INTERACTION_CREATE': {
      const user = packet.d.user
      const member = packet.d.member
      const guildId = packet.d.guild_id

      const promises = []

      if (user) {
        const userId = user.id
        promises.push(
          redis.set(buildUserKey(userId), JSON.stringify(user)),
        )

        if (guildId && member) {
          promises.push(
            redis.set(buildMemberKey(guildId, userId), JSON.stringify(member)),
            redis.sAdd(buildGuildMembersSetKey(guildId), userId),
          )
        }
      }

      await Promise.all(promises)
      break
    }
  }
})

await bot.connect()