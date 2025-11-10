import { db, workflowDeploymentVersion } from '@sim/db'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import { headers } from 'next/headers'
import { authenticateApiKeyFromHeader } from '@/lib/api-key/service'
import { getWorkflowAccessContext } from '@/lib/workflows/utils'

const logger = createLogger('WorkflowDeploymentVersionAPI')

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const requestId = generateRequestId()
  const { id, version } = await params

  const hdrs = await headers()
  const apiKeyHeader = hdrs.get('x-api-key') || hdrs.get('X-API-Key')
  if (!apiKeyHeader) {
    return NextResponse.json({ error: 'API key required' }, { status: 401 })
  }
  const auth = await authenticateApiKeyFromHeader(apiKeyHeader, { keyTypes: ['personal', 'workspace'] })
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user has access to the workflow (owner or workspace permission)
  const accessContext = await getWorkflowAccessContext(id, auth.userId)
  if (!accessContext) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  }
  const hasAccess = accessContext.isOwner || !!accessContext.workspacePermission
  if (!hasAccess) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
    const versionNum = Number(version)
    if (!Number.isFinite(versionNum)) {
      return createErrorResponse('Invalid version', 400)
    }

    const [row] = await db
      .select({ state: workflowDeploymentVersion.state })
      .from(workflowDeploymentVersion)
      .where(
        and(
          eq(workflowDeploymentVersion.workflowId, id),
          eq(workflowDeploymentVersion.version, versionNum)
        )
      )
      .limit(1)

    if (!row?.state) {
      return createErrorResponse('Deployment version not found', 404)
    }

    return createSuccessResponse({ deployedState: row.state })
  } catch (error: any) {
    logger.error(
      `[${requestId}] Error fetching deployment version ${version} for workflow ${id}`,
      error
    )
    return createErrorResponse(error.message || 'Failed to fetch deployment version', 500)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const requestId = generateRequestId()
  const { id, version } = await params

  const hdrs = await headers()
  const apiKeyHeader = hdrs.get('x-api-key') || hdrs.get('X-API-Key')
  if (!apiKeyHeader) {
    return NextResponse.json({ error: 'API key required' }, { status: 401 })
  }
  const auth = await authenticateApiKeyFromHeader(apiKeyHeader, { keyTypes: ['personal', 'workspace'] })
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user has write/admin access to the workflow
  const accessContext = await getWorkflowAccessContext(id, auth.userId)
  if (!accessContext) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  }
  const canWrite = accessContext.isOwner || accessContext.workspacePermission === 'admin' || accessContext.workspacePermission === 'write'
  if (!canWrite) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
    const versionNum = Number(version)
    if (!Number.isFinite(versionNum)) {
      return createErrorResponse('Invalid version', 400)
    }

    const body = await request.json()
    const { name } = body

    if (typeof name !== 'string') {
      return createErrorResponse('Name must be a string', 400)
    }

    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      return createErrorResponse('Name cannot be empty', 400)
    }

    if (trimmedName.length > 100) {
      return createErrorResponse('Name must be 100 characters or less', 400)
    }

    const [updated] = await db
      .update(workflowDeploymentVersion)
      .set({ name: trimmedName })
      .where(
        and(
          eq(workflowDeploymentVersion.workflowId, id),
          eq(workflowDeploymentVersion.version, versionNum)
        )
      )
      .returning({ id: workflowDeploymentVersion.id, name: workflowDeploymentVersion.name })

    if (!updated) {
      return createErrorResponse('Deployment version not found', 404)
    }

    logger.info(
      `[${requestId}] Renamed deployment version ${version} for workflow ${id} to "${trimmedName}"`
    )

    return createSuccessResponse({ name: updated.name })
  } catch (error: any) {
    logger.error(
      `[${requestId}] Error renaming deployment version ${version} for workflow ${id}`,
      error
    )
    return createErrorResponse(error.message || 'Failed to rename deployment version', 500)
  }
}
