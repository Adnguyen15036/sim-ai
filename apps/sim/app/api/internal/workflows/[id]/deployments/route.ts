import { db, user, workflowDeploymentVersion } from '@sim/db'
import { desc, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { getWorkflowAccessContext } from '@/lib/workflows/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import { headers } from 'next/headers'
import { authenticateApiKeyFromHeader } from '@/lib/api-key/service'

const logger = createLogger('WorkflowDeploymentsListAPI')

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId()
  const { id } = await params

  try {
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

    const versions = await db
      .select({
        id: workflowDeploymentVersion.id,
        version: workflowDeploymentVersion.version,
        name: workflowDeploymentVersion.name,
        isActive: workflowDeploymentVersion.isActive,
        createdAt: workflowDeploymentVersion.createdAt,
        createdBy: workflowDeploymentVersion.createdBy,
        deployedBy: user.name,
      })
      .from(workflowDeploymentVersion)
      .leftJoin(user, eq(workflowDeploymentVersion.createdBy, user.id))
      .where(eq(workflowDeploymentVersion.workflowId, id))
      .orderBy(desc(workflowDeploymentVersion.version))

    return createSuccessResponse({ versions })
  } catch (error: any) {
    logger.error(`[${requestId}] Error listing deployments for workflow: ${id}`, error)
    return createErrorResponse(error.message || 'Failed to list deployments', 500)
  }
}
