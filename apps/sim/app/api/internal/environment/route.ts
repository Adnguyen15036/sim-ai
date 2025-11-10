import { db } from '@sim/db'
import { environment } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLogger } from '@/lib/logs/console/logger'
import { decryptSecret, encryptSecret, generateRequestId } from '@/lib/utils'
import type { EnvironmentVariable } from '@/stores/settings/environment/types'
import { headers } from 'next/headers'
import { authenticateApiKeyFromHeader } from '@/lib/api-key/service'
import { getSystemManagedUserEnvKeysSet } from '@/lib/system-managed-env'

const logger = createLogger('EnvironmentAPI')
const SYSTEM_MANAGED_USER_ENV_KEYS = getSystemManagedUserEnvKeysSet()

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EnvVarSchema = z.object({
  variables: z.record(z.string()),
})

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    // Authenticate via Personal API Key (X-API-Key)
    const hdrs = await headers()
    const apiKey = hdrs.get('x-api-key') ?? hdrs.get('X-API-Key') ?? ''
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 })
    }
    const auth = await authenticateApiKeyFromHeader(apiKey, { keyTypes: ['personal'] })
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = auth.userId

    const body = await req.json()

    try {
      const { variables } = EnvVarSchema.parse(body)

      // Only upsert system-managed keys; ignore others
      const filteredEntries = Object.entries(variables).filter(([key]) =>
        SYSTEM_MANAGED_USER_ENV_KEYS.has(key)
      )

      // Load existing to preserve all other variables
      const existingRows = await db
        .select()
        .from(environment)
        .where(eq(environment.userId, userId))
        .limit(1)

      const existingEncrypted: Record<string, string> = (existingRows[0]?.variables as any) || {}

      // If nothing valid to update, keep existing as-is
      if (filteredEntries.length === 0) {
        return NextResponse.json({ success: true })
      }

      const encryptedIncoming = await Promise.all(
        filteredEntries.map(async ([key, value]) => {
          const { encrypted } = await encryptSecret(value)
          return [key, encrypted] as const
        })
      ).then((entries) => Object.fromEntries(entries))

      const merged = { ...existingEncrypted, ...encryptedIncoming }

      await db
        .insert(environment)
        .values({
          id: existingRows[0]?.id || crypto.randomUUID(),
          userId,
          variables: merged,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [environment.userId],
          set: {
            variables: merged,
            updatedAt: new Date(),
          },
        })

      return NextResponse.json({ success: true })
    } catch (validationError: any) {
      if (validationError instanceof z.ZodError) {
        logger.warn(`[${requestId}] Invalid environment variables data`, {
          errors: validationError.errors,
        })
        return NextResponse.json(
          { error: 'Invalid request data', details: validationError.errors },
          { status: 400 }
        )
      }
      throw validationError
    }
  } catch (error: any) {
    logger.error(`[${requestId}] Error updating environment variables`, error)
    return NextResponse.json({ error: 'Failed to update environment variables' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const requestId = generateRequestId()

  try {
    // Authenticate via Personal API Key (X-API-Key)
    const hdrs = await headers()
    const apiKey = hdrs.get('x-api-key') ?? hdrs.get('X-API-Key') ?? ''
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 })
    }
    const auth = await authenticateApiKeyFromHeader(apiKey, { keyTypes: ['personal'] })
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = auth.userId

    const result = await db
      .select()
      .from(environment)
      .where(eq(environment.userId, userId))
      .limit(1)

    if (!result.length || !result[0].variables) {
      return NextResponse.json({ data: {} }, { status: 200 })
    }

    const encryptedVariables = result[0].variables as Record<string, string>
    const decryptedVariables: Record<string, EnvironmentVariable> = {}

    for (const [key, encryptedValue] of Object.entries(encryptedVariables)) {
      try {
        const { decrypted } = await decryptSecret(encryptedValue)
        decryptedVariables[key] = { key, value: decrypted }
      } catch (error) {
        logger.error(`[${requestId}] Error decrypting variable ${key}`, error)
        decryptedVariables[key] = { key, value: '' }
      }
    }

    return NextResponse.json({ data: decryptedVariables }, { status: 200 })
  } catch (error: any) {
    logger.error(`[${requestId}] Environment fetch error`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
