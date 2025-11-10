import { db } from '@sim/db'
import { apiKey, environment, user } from '@sim/db/schema'
import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDeterministicServiceAccount } from '@/lib/auth/internal/deterministic-account'
import { verifySignedRequest } from '@/lib/auth/internal/signed-request'
import { createApiKey } from '@/lib/api-key/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { encryptSecret } from '@/lib/utils'

const logger = createLogger('InternalProvision')

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const verify = await verifySignedRequest(request, rawBody)
    if (!verify.ok) {
      return NextResponse.json({ error: verify.error || 'Unauthorized' }, { status: 401 })
    }

    // Parse once after signature verification
    let body: any = {}
    try {
      body = rawBody ? JSON.parse(rawBody) : {}
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const appId: string | undefined = body?.appId
    if (!appId) {
      return NextResponse.json({ error: 'appId required' }, { status: 400 })
    }

    const apiToken: string | undefined = body?.apiToken
    if (!apiToken) {
      return NextResponse.json({ error: 'apiToken required' }, { status: 400 })
    }

    const rawName: unknown = body?.name
    const name = (typeof rawName === 'string' && rawName.trim().length > 0)
      ? rawName.trim()
      : `GIM ${appId} Personal Key`

    // Deterministic service account
    const { email, password } = getDeterministicServiceAccount(appId)

    // Ensure account exists
    try {
      await auth.api.signUpEmail({
        returnHeaders: true,
        body: { email, password, name: 'GIM App' },
      })
      logger.info('Service account created', { email, appId })
    } catch {
      await auth.api.signInEmail({
        returnHeaders: true,
        body: { email, password },
      })
      logger.info('Service account signed in', { email, appId })
    }

    // Resolve userId by email to associate API key and env
    const rows = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)
    const userId = rows?.[0]?.id
    if (!userId) {
      logger.error('Failed to resolve user after signup/signin', { email, appId })
      return NextResponse.json({ error: 'Failed to resolve user' }, { status: 500 })
    }

    // Uniqueness check on personal key name (per user)
    const existingKey = await db
      .select({ id: apiKey.id })
      .from(apiKey)
      .where(and(eq(apiKey.userId, userId), eq(apiKey.name, name), eq(apiKey.type, 'personal')))
      .limit(1)
    if (existingKey.length > 0) {
      return NextResponse.json({
        error: `A personal API key named "${name}" already exists. Please choose a different name.`,
      }, { status: 409 })
    }

    // Create personal API key
    const { key: plainKey, encryptedKey } = await createApiKey(true)
    if (!encryptedKey) {
      throw new Error('Failed to encrypt API key for storage')
    }

    const [newKey] = await db
      .insert(apiKey)
      .values({
        id: nanoid(),
        userId,
        workspaceId: null,
        name,
        key: encryptedKey,
        type: 'personal',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({
        id: apiKey.id,
        name: apiKey.name,
        createdAt: apiKey.createdAt,
      })

    if (apiToken || appId) {
      try {
        const existingEnvRows = await db
          .select()
          .from(environment)
          .where(eq(environment.userId, userId))
          .limit(1)

        const currentEncrypted: Record<string, string> = (existingEnvRows[0]?.variables as any) || {}
        const merged: Record<string, string> = {
          ...currentEncrypted,
        }
        if (apiToken) {
          const { encrypted } = await encryptSecret(apiToken)
          merged.SYSTEM_MANAGED_GIM_APPLICATION_API_TOKEN = encrypted
        }
        if (appId) {
          const { encrypted } = await encryptSecret(appId)
          merged.SYSTEM_MANAGED_GIM_APPLICATION_ID = encrypted
        }

        await db
          .insert(environment)
          .values({
            id: existingEnvRows[0]?.id || nanoid(),
            userId,
            variables: merged,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [environment.userId],
            set: { variables: merged, updatedAt: new Date() },
          })
      } catch (e) {
        logger.error('Failed to persist GIM application credentials', { userId, appId })
      }
    }

    return NextResponse.json({
      user: { id: userId, email },
      key: { ...newKey, key: plainKey },
    }, { status: 201 })
  } catch (error: any) {
    logger.error('provision error', { message: error?.message, stack: error?.stack })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'


