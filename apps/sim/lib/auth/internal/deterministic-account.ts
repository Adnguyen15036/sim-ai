import crypto from 'crypto'
import { env } from '@/lib/env'

export function getDeterministicServiceAccount(appId: string): { email: string; password: string } {
  const email = `app_${appId}@sim.com`
  const salt = env.EMBED_APP_SALT || env.INTERNAL_API_SECRET
  const pwdBuf = crypto.createHmac('sha256', String(salt)).update(appId).digest()
  const password = pwdBuf.toString('base64url')
  return { email, password }
}


