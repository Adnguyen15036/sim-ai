import { db } from '@sim/db'
import {
  permissions,
  workspace,
  workflow,
  workflowBlocks,
  workflowEdges,
  workflowSubflows,
} from '@sim/db/schema'
import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { authenticateApiKeyFromHeader } from '@/lib/api-key/service'
import { createLogger } from '@/lib/logs/console/logger'
import { getUserEntityPermissions } from '@/lib/permissions/utils'

const logger = createLogger('WorkspaceDuplicateAPI')

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sourceWorkspaceId } = await params

  const hdrs = await headers()
  const apiKeyHeader = hdrs.get('x-api-key') || hdrs.get('X-API-Key')
  if (!apiKeyHeader) {
    return NextResponse.json({ error: 'API key required' }, { status: 401 })
  }

  // Allow both personal and workspace keys; if workspace key present, restrict to that workspace
  const auth = await authenticateApiKeyFromHeader(apiKeyHeader, { keyTypes: ['personal', 'workspace'] })
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (auth.workspaceId && auth.workspaceId !== sourceWorkspaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const requestedName: unknown = body?.name
    const sourceMainWorkflowIdRaw: unknown = body?.sourceMainWorkflowId
    if (typeof sourceMainWorkflowIdRaw !== 'string' || !sourceMainWorkflowIdRaw.trim()) {
      return NextResponse.json({ error: 'sourceMainWorkflowId is required' }, { status: 400 })
    }
    const sourceMainWorkflowId = sourceMainWorkflowIdRaw.trim()

    // Check access to source workspace
    const userPermission = await getUserEntityPermissions(auth.userId, 'workspace', sourceWorkspaceId)
    if (userPermission !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Load source workspace
    const sourceWs = await db
      .select()
      .from(workspace)
      .where(eq(workspace.id, sourceWorkspaceId))
      .then((rows) => rows[0])

    if (!sourceWs) {
      return NextResponse.json({ error: 'Source workspace not found' }, { status: 404 })
    }

    // Validate that the provided main workflow belongs to the source workspace
    const mainWf = await db
      .select({ id: workflow.id })
      .from(workflow)
      .where(and(eq(workflow.id, sourceMainWorkflowId), eq(workflow.workspaceId, sourceWorkspaceId)))
      .limit(1)
    if (mainWf.length === 0) {
      return NextResponse.json({ error: 'sourceMainWorkflowId not found in the source workspace' }, { status: 404 })
    }

    const newWorkspaceId = crypto.randomUUID()
    const now = new Date()
    const newName = typeof requestedName === 'string' && requestedName.trim()
      ? requestedName.trim()
      : `${sourceWs.name} (Copy)`

    const result = await db.transaction(async (tx) => {
      // 0) Precompute workflow ID mapping for all source workflows
      const allSourceWorkflows = await tx
        .select()
        .from(workflow)
        .where(eq(workflow.workspaceId, sourceWorkspaceId))

      const workflowIdMap = new Map<string, string>()
      for (const wf of allSourceWorkflows) {
        workflowIdMap.set(wf.id, crypto.randomUUID())
      }

      // 1) Create the new workspace owned by the requesting user
      await tx.insert(workspace).values({
        id: newWorkspaceId,
        name: newName,
        ownerId: auth.userId!,
        createdAt: now,
        updatedAt: now,
      })

      await tx.insert(permissions).values({
        id: crypto.randomUUID(),
        entityType: 'workspace',
        entityId: newWorkspaceId,
        userId: auth.userId!,
        permissionType: 'admin',
        createdAt: now,
        updatedAt: now,
      })

      // 2) Duplicate all workflows in the source workspace into the new workspace
      const sourceWorkflows = allSourceWorkflows

      const duplicated: { oldId: string; newId: string }[] = []

      for (const source of sourceWorkflows) {
        const newWorkflowId = workflowIdMap.get(source.id)!

        // Create the new workflow row
        await tx.insert(workflow).values({
          id: newWorkflowId,
          userId: auth.userId!,
          workspaceId: newWorkspaceId,
          folderId: null, // do not carry over folder structure
          name: source.name,
          description: source.description,
          color: source.color,
          lastSynced: now,
          createdAt: now,
          updatedAt: now,
          isDeployed: false,
          collaborators: [],
          runCount: 0,
          variables: source.variables ? remapVariablesObject(source.variables as any, newWorkflowId) : {},
          isPublished: false,
          marketplaceData: null,
        })

        // Copy blocks
        const sourceBlocks = await tx
          .select()
          .from(workflowBlocks)
          .where(eq(workflowBlocks.workflowId, source.id))

        const blockIdMapping = new Map<string, string>()
        for (const block of sourceBlocks) {
          blockIdMapping.set(block.id, crypto.randomUUID())
        }
        if (sourceBlocks.length > 0) {
          const newBlocks = sourceBlocks.map((block) => {
            const newBlockId = blockIdMapping.get(block.id)!
            const blockData = block.data && typeof block.data === 'object' && !Array.isArray(block.data) ? (block.data as any) : {}
            const blockSubBlocks = block.subBlocks && typeof block.subBlocks === 'object' && !Array.isArray(block.subBlocks) ? (block.subBlocks as any) : {}
            let newParentId = blockData.parentId
            if (blockData.parentId && blockIdMapping.has(blockData.parentId)) {
              newParentId = blockIdMapping.get(blockData.parentId)!
            }
            let updatedData = block.data
            let newExtent = blockData.extent
            let updatedSubBlocks: any = block.subBlocks
            if (block.data && typeof block.data === 'object' && !Array.isArray(block.data)) {
              const dataObj = block.data as any
              if (typeof dataObj.parentId === 'string') {
                updatedData = { ...dataObj }
                if (blockIdMapping.has(dataObj.parentId)) {
                  ;(updatedData as any).parentId = blockIdMapping.get(dataObj.parentId)!
                  ;(updatedData as any).extent = 'parent'
                  newExtent = 'parent'
                }
              }
            }
            // Remap child workflow reference for Workflow Input blocks via subBlocks
            if (block.type === 'workflow_input' && blockSubBlocks && typeof blockSubBlocks === 'object') {
              const sb = blockSubBlocks as any
              const current = sb.workflowId?.value
              if (typeof current === 'string' && workflowIdMap.has(current)) {
                updatedSubBlocks = { ...(sb as any) }
                updatedSubBlocks.workflowId = {
                  ...(sb.workflowId || {}),
                  value: workflowIdMap.get(current)!,
                }
              }
            }
            return {
              ...block,
              id: newBlockId,
              workflowId: newWorkflowId,
              parentId: newParentId,
              extent: newExtent,
              data: updatedData,
              subBlocks: updatedSubBlocks,
              createdAt: now,
              updatedAt: now,
            }
          })
          await tx.insert(workflowBlocks).values(newBlocks)
        }

        // Copy edges
        const sourceEdges = await tx
          .select()
          .from(workflowEdges)
          .where(eq(workflowEdges.workflowId, source.id))
        if (sourceEdges.length > 0) {
          const newEdges = sourceEdges.map((edge) => ({
            ...edge,
            id: crypto.randomUUID(),
            workflowId: newWorkflowId,
            sourceBlockId: blockIdMapping.get(edge.sourceBlockId) || edge.sourceBlockId,
            targetBlockId: blockIdMapping.get(edge.targetBlockId) || edge.targetBlockId,
            createdAt: now,
            updatedAt: now,
          }))
          await tx.insert(workflowEdges).values(newEdges)
        }

        // Copy subflows
        const sourceSubflows = await tx
          .select()
          .from(workflowSubflows)
          .where(eq(workflowSubflows.workflowId, source.id))
        if (sourceSubflows.length > 0) {
          const newSubflows = sourceSubflows
            .map((subflow) => {
              const newSubflowId = blockIdMapping.get(subflow.id)
              if (!newSubflowId) return null
              let updatedConfig: any = subflow.config
              if (subflow.config && typeof subflow.config === 'object') {
                updatedConfig = JSON.parse(JSON.stringify(subflow.config))
                updatedConfig.id = newSubflowId
                if (Array.isArray(updatedConfig.nodes)) {
                  updatedConfig.nodes = updatedConfig.nodes.map((n: string) => blockIdMapping.get(n) || n)
                }
              }
              return {
                ...subflow,
                id: newSubflowId,
                workflowId: newWorkflowId,
                config: updatedConfig,
                createdAt: now,
                updatedAt: now,
              }
            })
            .filter((s): s is NonNullable<typeof s> => s !== null)
          if (newSubflows.length > 0) {
            await tx.insert(workflowSubflows).values(newSubflows)
          }
        }

        duplicated.push({ oldId: source.id, newId: newWorkflowId })
      }

      return {
        workspace: {
          id: newWorkspaceId,
          name: newName,
          ownerId: auth.userId!,
          createdAt: now,
          updatedAt: now,
        },
        duplicatedWorkflows: duplicated,
      }
    })

    const destMain = result.duplicatedWorkflows.find((m) => m.oldId === sourceMainWorkflowId)
    if (!destMain) {
      // Should not happen if validation passed
      return NextResponse.json({ error: 'Failed to resolve duplicated main workflow' }, { status: 500 })
    }

    return NextResponse.json({ ...result, destMainWorkflowId: destMain.newId }, { status: 201 })
  } catch (error) {
    logger.error(`Error duplicating workspace ${sourceWorkspaceId}:`, error)
    return NextResponse.json({ error: 'Failed to duplicate workspace' }, { status: 500 })
  }
}

function remapVariablesObject(vars: any, newWorkflowId: string) {
  try {
    const sourceVars = (vars as Record<string, any>) || {}
    const remapped: Record<string, any> = {}
    for (const [, variable] of Object.entries(sourceVars)) {
      const newVarId = crypto.randomUUID()
      remapped[newVarId] = {
        ...variable,
        id: newVarId,
        workflowId: newWorkflowId,
      }
    }
    return remapped
  } catch {
    return {}
  }
}


