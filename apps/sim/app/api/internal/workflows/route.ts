import { randomUUID } from 'crypto'
import { db } from '@sim/db'
import { permissions, workflow, workspace } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateApiKeyFromHeader } from '@/lib/api-key/service'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { extractAndPersistCustomTools } from '@/lib/workflows/custom-tools-persistence.ts'
import { saveWorkflowToNormalizedTables } from '@/lib/workflows/db-helpers.ts'
import { getWorkflowAccessContext } from '@/lib/workflows/utils.ts'
import { sanitizeAgentToolsInBlocks } from '@/lib/workflows/validation.ts'
import {
  type WorkflowState,
  WorkflowStateSchema,
} from '@/app/api/internal/workflows/[id]/state/route.ts'
import { verifyWorkspaceMembership } from './utils'

const logger = createLogger('WorkflowAPI')

const CreateWorkflowSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  color: z.string().optional().default('#3972F6'),
  workspaceId: z.string().optional(),
  folderId: z.string().nullable().optional(),
  useTemplate: z.boolean().optional().default(false),
  template: WorkflowStateSchema.optional(),
  autoCreateWorkspace: z.boolean().optional().default(false),
})

// GET /api/workflows - Get workflows for user (optionally filtered by workspaceId)
export async function GET(request: Request) {
  const requestId = generateRequestId()
  const startTime = Date.now()
  const url = new URL(request.url)
  const workspaceId = url.searchParams.get('workspaceId')

  if (!workspaceId) {
    return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 })
  }

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
    const userId = auth.userId

    if (workspaceId) {
      const workspaceExists = await db
        .select({ id: workspace.id })
        .from(workspace)
        .where(eq(workspace.id, workspaceId))
        .then((rows) => rows.length > 0)

      if (!workspaceExists) {
        logger.warn(
          `[${requestId}] Attempt to fetch workflows for non-existent workspace: ${workspaceId}`
        )
        return NextResponse.json(
          { error: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND' },
          { status: 404 }
        )
      }

      const userRole = await verifyWorkspaceMembership(userId, workspaceId)

      if (!userRole) {
        logger.warn(
          `[${requestId}] User ${userId} attempted to access workspace ${workspaceId} without membership`
        )
        return NextResponse.json(
          { error: 'Access denied to this workspace', code: 'WORKSPACE_ACCESS_DENIED' },
          { status: 403 }
        )
      }
    }

    let workflows

    if (workspaceId) {
      workflows = await db.select().from(workflow).where(eq(workflow.workspaceId, workspaceId))
    } else {
      workflows = await db.select().from(workflow).where(eq(workflow.userId, userId))
    }

    return NextResponse.json({ data: workflows }, { status: 200 })
  } catch (error: any) {
    const elapsed = Date.now() - startTime
    logger.error(`[${requestId}] Workflow fetch error after ${elapsed}ms`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/workflows - Create a new workflow
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()

  const hdrs = await headers()
  const apiKeyHeader = hdrs.get('x-api-key') || hdrs.get('X-API-Key')
  if (!apiKeyHeader) {
    return NextResponse.json({ error: 'API key required' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, description, color, workspaceId, folderId, useTemplate, template, autoCreateWorkspace } =
      CreateWorkflowSchema.parse(body)

    if (useTemplate && !template) {
      return NextResponse.json({ error: 'Workflow template is required' }, { status: 400 })
    }

    const auth = await authenticateApiKeyFromHeader(apiKeyHeader, { keyTypes: ['personal', 'workspace'] })
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const workflowId = crypto.randomUUID()
    const now = new Date()

    logger.info(`[${requestId}] Creating workflow ${workflowId} for user ${auth.userId}`)

    // Track workflow creation
    try {
      const { trackPlatformEvent } = await import('@/lib/telemetry/tracer')
      trackPlatformEvent('platform.workflow.created', {
        'workflow.id': workflowId,
        'workflow.name': name,
        'workflow.has_workspace': !!workspaceId,
        'workflow.has_folder': !!folderId,
      })
    } catch (_e) {
      // Silently fail
    }

    // Determine target workspace (optionally auto-create)
    let targetWorkspaceId = workspaceId || null
    const userIdStrict = auth.userId as string
    if (!targetWorkspaceId && autoCreateWorkspace) {
      const newWorkspaceId = randomUUID()
      const wsName = name
      await db.transaction(async (tx) => {
        await tx.insert(workspace).values({
          id: newWorkspaceId,
          name: wsName,
          ownerId: userIdStrict,
          createdAt: now,
          updatedAt: now,
        })
        await tx.insert(permissions).values({
          id: randomUUID(),
          entityType: 'workspace',
          entityId: newWorkspaceId,
          userId: userIdStrict,
          permissionType: 'admin' as const,
          createdAt: now,
          updatedAt: now,
        })
      })
      targetWorkspaceId = newWorkspaceId
    }

    await db.insert(workflow).values({
      id: workflowId,
      userId: userIdStrict,
      workspaceId: targetWorkspaceId,
      folderId: folderId || null,
      name,
      description,
      color,
      lastSynced: now,
      createdAt: now,
      updatedAt: now,
      isDeployed: false,
      collaborators: [],
      runCount: 0,
      variables: {},
      isPublished: false,
      marketplaceData: null,
    })

    logger.info(`[${requestId}] Successfully created empty workflow ${workflowId}`)

    // import template for workflow
    if (useTemplate) {
      const addTemplateResult = await addingTemplate(requestId, workflowId, auth.userId, template!)
      if (!addTemplateResult.success) {
        return NextResponse.json({ error: addTemplateResult.error }, { status: 500 })
      }
    }

    return NextResponse.json({
      id: workflowId,
      name,
      description,
      color,
      workspaceId: targetWorkspaceId,
      folderId,
      createdAt: now,
      updatedAt: now,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(`[${requestId}] Invalid workflow creation data`, {
        errors: error.errors,
      })
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    logger.error(`[${requestId}] Error creating workflow`, error)
    return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 })
  }
}

async function addingTemplate(
  requestId: string,
  workflowId: string,
  userId: string,
  template: WorkflowState
): Promise<{ success: true } | { success: false; error: string }> {
  const startTime = Date.now()
  const newTemplate = updateTemplateUUIDsInPlace(template)
  const state = WorkflowStateSchema.parse(newTemplate)

  if (!state) {
    return { success: false, error: 'Invalid template' }
  }

  // Fetch the workflow to check ownership/access
  const accessContext = await getWorkflowAccessContext(workflowId, userId)
  const workflowData = accessContext?.workflow

  if (!workflowData) {
    logger.warn(`[${requestId}] Workflow ${workflowId} not found for state update`)
    return { success: false, error: 'Workflow not found' }
  }

  // Check if user has permission to update this workflow
  const canUpdate =
    accessContext?.isOwner ||
    (workflowData.workspaceId
      ? accessContext?.workspacePermission === 'write' ||
        accessContext?.workspacePermission === 'admin'
      : false)

  if (!canUpdate) {
    logger.warn(
      `[${requestId}] User ${userId} denied permission to update workflow state ${workflowId}`
    )
    return { success: false, error: 'Access denied for user ${userId}' }
  }

  // Sanitize custom tools in agent blocks before saving
  const { blocks: sanitizedBlocks, warnings } = sanitizeAgentToolsInBlocks(state.blocks as any)

  // Save to normalized tables
  // Ensure all required fields are present for WorkflowState type
  // Filter out blocks without type or name before saving
  const filteredBlocks = Object.entries(sanitizedBlocks).reduce(
    (acc, [blockId, block]: [string, any]) => {
      if (block.type && block.name) {
        // Ensure all required fields are present
        acc[blockId] = {
          ...block,
          enabled: block.enabled !== undefined ? block.enabled : true,
          horizontalHandles: block.horizontalHandles !== undefined ? block.horizontalHandles : true,
          isWide: block.isWide !== undefined ? block.isWide : false,
          height: block.height !== undefined ? block.height : 0,
          subBlocks: block.subBlocks || {},
          outputs: block.outputs || {},
        }
      }
      return acc
    },
    {} as typeof state.blocks
  )

  const workflowState = {
    blocks: filteredBlocks,
    edges: state.edges,
    loops: state.loops || {},
    parallels: state.parallels || {},
    lastSaved: state.lastSaved || Date.now(),
    isDeployed: state.isDeployed || false,
    deployedAt: state.deployedAt,
  }

  const saveResult = await saveWorkflowToNormalizedTables(workflowId, workflowState as any)

  if (!saveResult.success) {
    logger.error(`[${requestId}] Failed to save workflow ${workflowId} state:`, saveResult.error)
    return { success: false, error: 'Failed to save workflow state' }
  }

  // Extract and persist custom tools to database
  try {
    const { saved, errors } = await extractAndPersistCustomTools(workflowState, userId)

    if (saved > 0) {
      logger.info(`[${requestId}] Persisted ${saved} custom tool(s) to database`, { workflowId })
    }

    if (errors.length > 0) {
      logger.warn(`[${requestId}] Some custom tools failed to persist`, { errors, workflowId })
    }
  } catch (error) {
    logger.error(`[${requestId}] Failed to persist custom tools`, { error, workflowId })
  }

  // Update workflow's lastSynced timestamp
  await db
    .update(workflow)
    .set({
      lastSynced: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workflow.id, workflowId))

  const elapsed = Date.now() - startTime
  logger.info(`[${requestId}] Successfully saved workflow ${workflowId} state in ${elapsed}ms`)

  return { success: true }
}

function updateTemplateUUIDsInPlace(template: WorkflowState): WorkflowState {
  if (!template || typeof template !== 'object') {
    throw new Error('Invalid template')
  }

  // 1️⃣ Map block cũ → mới
  const blockIdMap: Record<string, string> = {}
  for (const oldId of Object.keys(template.blocks ?? {})) {
    blockIdMap[oldId] = randomUUID()
  }

  // 2️⃣ Cập nhật blocks (và subBlocks nếu có)
  const newBlocks: Record<string, any> = {}
  for (const [oldId, block] of Object.entries(template.blocks ?? {})) {
    const newId = blockIdMap[oldId]
    block.id = newId

    // cập nhật subBlocks
    for (const [subId, subBlock] of Object.entries(block.subBlocks ?? {})) {
      subBlock.id = randomUUID()
      block.subBlocks[subId] = subBlock
    }

    newBlocks[newId] = block
  }
  template.blocks = newBlocks

  // 3️⃣ Cập nhật edges
  if (Array.isArray(template.edges)) {
    for (const edge of template.edges) {
      edge.id = randomUUID()
      if (blockIdMap[edge.source]) edge.source = blockIdMap[edge.source]
      if (blockIdMap[edge.target]) edge.target = blockIdMap[edge.target]
    }
  }

  // 4️⃣ Cập nhật loops
  if (template.loops && typeof template.loops === 'object') {
    const newLoops: Record<string, any> = {}
    for (const [oldLoopId, loop] of Object.entries(template.loops)) {
      const newLoopId = randomUUID()
      loop.id = newLoopId
      loop.nodes = loop.nodes.map((n) => blockIdMap[n] ?? n)
      newLoops[newLoopId] = loop
    }
    template.loops = newLoops
  }

  // 5️⃣ Cập nhật parallels
  if (template.parallels && typeof template.parallels === 'object') {
    const newParallels: Record<string, any> = {}
    for (const [oldParId, parallel] of Object.entries(template.parallels)) {
      const newParId = randomUUID()
      parallel.id = newParId
      parallel.nodes = parallel.nodes.map((n) => blockIdMap[n] ?? n)
      newParallels[newParId] = parallel
    }
    template.parallels = newParallels
  }

  return template
}
