export interface GatewayPayload<T = any> {
  shard_id: number
  topic: string
  data: T
  received_at: number
}

export interface ShardMetrics {
  id: number
  guilds_count: number
  status: string
  latency: number
}

export interface ShardsMetricsResponse {
  shards: ShardMetrics[]
  instance_ready: boolean
}

export interface NatsBroardcastRequestOptions {
  timeoutMs?: number
  data?: Uint8Array
}
