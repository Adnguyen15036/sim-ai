import { db } from '@sim/db'
import { workflow as workflowTable } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { createLogger } from '@/lib/logs/console/logger'
import { getRedisClient } from '@/lib/redis'

const logger = createLogger('WorkflowCache')

const CACHE_KEY_PREFIX = 'workflow:workspaceId:'
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 // 24 hours

export async function getWorkspaceIdForWorkflow(
  workflowId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string | undefined> {
  const startTime = Date.now()
  logger.info(`GetWorkspaceIdForWorkflow: Starting for workflow ${workflowId}`)
  if (!workflowId) return undefined

  const redis = getRedisClient()
  const cacheKey = `${CACHE_KEY_PREFIX}${workflowId}`

  try {
    if (redis) {
      const cached = await redis.get(cacheKey)
      if (cached) {
        logger.info(`GetWorkspaceIdForWorkflow: Cache hit for workflow ${workflowId}`)
        return cached || undefined
      }
    }
  } catch (error) {
    logger.warn('Redis get failed, falling back to DB', { error })
  }

  const rows = await db
    .select({ workspaceId: workflowTable.workspaceId })
    .from(workflowTable)
    .where(eq(workflowTable.id, workflowId))
    .limit(1)

  logger.info(`GetWorkspaceIdForWorkflow: Get workflow took ${Date.now() - startTime}ms`)
  const workspaceId = rows[0]?.workspaceId ?? undefined

  if (workspaceId && redis) {
    try {
      await redis.set(cacheKey, workspaceId, 'EX', ttlSeconds)
    } catch (error) {
      logger.warn('Redis set failed, continuing without cache', { error })
    }
  }

  return workspaceId
}


