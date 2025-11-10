import crypto from 'crypto'
import { type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { hasProcessedMessage, markMessageAsProcessed } from '@/lib/redis'

const NONCE_PREFIX = 'embed-nonce:'
const SIGNATURE_WINDOW_MS = 60_000

export function getRequestPath(req: NextRequest): string {
  try {
    const url = new URL(req.url)
    return url.pathname
  } catch {
    return '/api/internal'
  }
}

export function computeSignature(
  secret: string,
  method: string,
  path: string,
  body: string,
  timestamp: string,
  nonce: string
): string {
  const payload = `${method}\n${path}\n${body}\n${timestamp}\n${nonce}`
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export async function verifySignedRequest(
  req: NextRequest,
  rawBody: string
): Promise<{ ok: boolean; error?: string }> {
  const signature = req.headers.get('x-internal-signature') || ''
  const timestamp = req.headers.get('x-internal-timestamp') || ''
  const nonce = req.headers.get('x-internal-nonce') || ''

  if (!signature || !timestamp || !nonce) {
    return { ok: false, error: 'Missing signature headers' }
  }

  const tsNum = Number(timestamp)
  if (!Number.isFinite(tsNum)) {
    return { ok: false, error: 'Invalid timestamp' }
  }
  const now = Date.now()
  if (Math.abs(now - tsNum) > SIGNATURE_WINDOW_MS) {
    return { ok: false, error: 'Stale request' }
  }

  // Replay protection via nonce single-use cache
  const nonceKey = `${NONCE_PREFIX}${nonce}`
  if (await hasProcessedMessage(nonceKey)) {
    return { ok: false, error: 'Replay detected' }
  }

  const method = req.method.toUpperCase()
  const path = getRequestPath(req)
  const expected = computeSignature(
    env.INTERNAL_API_SECRET,
    method,
    path,
    rawBody,
    timestamp,
    nonce
  )
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { ok: false, error: 'Invalid signature' }
  }

  // Mark nonce as used for the window duration
  await markMessageAsProcessed(nonceKey, Math.ceil(SIGNATURE_WINDOW_MS / 1000))
  return { ok: true }
}


