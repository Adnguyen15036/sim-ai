import { db } from '@sim/db'
import { environment } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { decryptSecret, encryptSecret, generateRequestId } from '@/lib/utils'
import type { EnvironmentVariable } from '@/stores/settings/environment/types'
import { getSystemManagedUserEnvKeysSet } from '@/lib/system-managed-env'

const logger = createLogger('EnvironmentAPI')

const EnvVarSchema = z.object({
  variables: z.record(z.string()),
})
const SYSTEM_MANAGED_USER_ENV_KEYS = getSystemManagedUserEnvKeysSet()

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized environment variables update attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    try {
      const { variables } = EnvVarSchema.parse(body)

      // Load existing personal env for merge/preservation of system-managed keys
      const existing = await db
        .select()
        .from(environment)
        .where(eq(environment.userId, session.user.id))
        .limit(1)

      const existingEncrypted: Record<string, string> = (existing[0]?.variables as any) || {}

      // Remove any attempt to set system-managed keys via UI
      for (const k of Object.keys(variables)) {
        if (SYSTEM_MANAGED_USER_ENV_KEYS.has(k)) {
          delete (variables as any)[k]
        }
      }

      const encryptedIncoming = await Promise.all(
        Object.entries(variables).map(async ([key, value]) => {
          const { encrypted } = await encryptSecret(value)
          return [key, encrypted] as const
        })
      ).then((entries) => Object.fromEntries(entries))

      // Preserve system-managed keys if already present
      for (const key of SYSTEM_MANAGED_USER_ENV_KEYS) {
        if (existingEncrypted[key]) {
          encryptedIncoming[key] = existingEncrypted[key]
        }
      }

      await db
        .insert(environment)
        .values({
          id: existing[0]?.id || crypto.randomUUID(),
          userId: session.user.id,
          variables: encryptedIncoming,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [environment.userId],
          set: {
            variables: encryptedIncoming,
            updatedAt: new Date(),
          },
        })

      return NextResponse.json({ success: true })
    } catch (validationError) {
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
  } catch (error) {
    logger.error(`[${requestId}] Error updating environment variables`, error)
    return NextResponse.json({ error: 'Failed to update environment variables' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const requestId = generateRequestId()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized environment variables access attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

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
      if (SYSTEM_MANAGED_USER_ENV_KEYS.has(key)) {
        continue
      }
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
