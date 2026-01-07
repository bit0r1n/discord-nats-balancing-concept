import { Empty, type NatsConnection, createInbox } from 'nats'
import { NatsBroardcastRequestOptions } from './interfaces.js'

export const buildEventSubject = (discordEvent: string) => `discord.gateway.events.${discordEvent.toLowerCase().replaceAll('_', '.')}`

export async function broadcastRequest<T = any>(nc: NatsConnection, subject: string, options?: NatsBroardcastRequestOptions): Promise<T[]> {
  const inbox = createInbox()
  const sub = nc.subscribe(inbox)

  const responses: T[] = []

  ;(async () => {
    for await (const msg of sub) {
      responses.push(msg.json<T>())
    }
  })()

  nc.publish(subject, options?.data ?? Empty, { reply: inbox })

  await new Promise((resolve) => setTimeout(resolve, options?.timeoutMs ?? 500))

  sub.unsubscribe()
  return responses
}
