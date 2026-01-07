import { type NatsConnection } from 'nats'
import { type createClient } from 'redis'
import { type Client as OceanicClient } from 'oceanic.js'

export interface HandlerContext {
  nats: NatsConnection
  redis: ReturnType<typeof createClient>
  discord: OceanicClient
}