const discordPrefix = 'discord_cache'

// sets
export const buildGuildChannelsSetKey = (guildId: string) =>
  `${discordPrefix}:guild_channels:${guildId}`
export const buildGuildThreadsSetKey = (guildId: string) =>
  `${discordPrefix}:guild_threads:${guildId}`
export const buildGuildMembersSetKey = (guildId: string) =>
  `${discordPrefix}:guild_members:${guildId}`
export const buildGuildRolesSetKey = (guildId: string) =>
  `${discordPrefix}:guild_roles:${guildId}`

// entities
export const buildGuildKey = (guildId: string) =>
  `${discordPrefix}:guilds:${guildId}`
export const buildChannelKey = (channelId: string) =>
  `${discordPrefix}:channels:${channelId}`
export const buildThreadKey = (threadId: string) =>
  `${discordPrefix}:threads:${threadId}`
export const buildMemberKey = (guildId: string, memberId: string) =>
  `${discordPrefix}:members:${guildId}:${memberId}`
export const buildRoleKey = (roleId: string) =>
  `${discordPrefix}:roles:${roleId}`
export const buildUserKey = (userId: string) =>
  `${discordPrefix}:users:${userId}`
