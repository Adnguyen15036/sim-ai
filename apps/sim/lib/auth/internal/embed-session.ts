import crypto from 'crypto'
import { getRedisClient } from '@/lib/redis'

// One-time code storage (fallback when Redis is not configured)
const inMemoryCodes = new Map<string, { value: string; expiry: number }>()
const CODE_PREFIX = 'embed-code:'
const NONCE_PREFIX = 'embed-nonce:'
export const CODE_TTL_SECONDS = 120
const SIGNATURE_WINDOW_MS = 60_000

export function generateCode(): string {
  return crypto.randomBytes(24).toString('hex')
}

export async function storeCode(code: string, payload: any, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient()
  const key = `${CODE_PREFIX}${code}`
  const value = JSON.stringify(payload)
  if (redis) {
    await redis.set(key, value, 'EX', ttlSeconds)
    return
  }
  inMemoryCodes.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 })
}

export async function consumeCode(code: string): Promise<any | null> {
  const redis = getRedisClient()
  const key = `${CODE_PREFIX}${code}`
  if (redis) {
    const value = await redis.get(key)
    if (!value) return null
    await redis.del(key)
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  const entry = inMemoryCodes.get(key)
  if (!entry) return null
  inMemoryCodes.delete(key)
  if (entry.expiry < Date.now()) return null
  try {
    return JSON.parse(entry.value)
  } catch {
    return null
  }
}


