import { getGimBaseUrl } from '@/lib/gim'
import { createLogger } from '@/lib/logs/console/logger'
import { getVyinChatTriggerPayload } from '@/lib/workflows/vyin-trigger'
import { generateIntentRouterPrompt } from '@/blocks/blocks/vyin_intent_router'
import type { BlockOutput } from '@/blocks/types'
import { BlockType } from '@/executor/consts'
import type { PathTracker } from '@/executor/path/path'
import type { BlockHandler, ExecutionContext } from '@/executor/types'
import type { SerializedBlock } from '@/serializer/types'
import { executeTool } from '@/tools'
import { getTool } from '@/tools/utils'

const logger = createLogger('IntentRouterBlockHandler')

/**
 * Handler for intent router block that dynamically select execution paths.
 */
export class VyinIntentRouterBlockHandler implements BlockHandler {
  /**
   * @param pathTracker - Utility for tracking execution paths
   */
  constructor(private pathTracker: PathTracker) {}

  canHandle(block: SerializedBlock): boolean {
    return block.metadata?.id === BlockType.VYIN_INTENT_ROUTER
  }

  async execute(
    block: SerializedBlock,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<BlockOutput> {
    logger.info(`Executing Vyin Intent Router block: ${block.id}`)
    const targetBlocks = this.getTargetBlocks(block, context)

    try {
      const toolId = block.config.tool || 'vyin_bot_assistant'
      const tool = getTool(toolId)
      if (!tool) throw new Error(`Tool not found: ${toolId}`)

      const vyin = getVyinChatTriggerPayload(context)
      const appIdFromTrigger = (vyin.app_id || '').trim()
      const apiTokenFromTrigger = (vyin.api_token || '').trim()
      const botProfile = (inputs.botProfile || '').toString().trim()
      const userInput = (inputs.userInput || '').toString()

      if (!botProfile) {
        throw new Error('Bot profile is required')
      }
      if (!userInput) {
        throw new Error('User input is required')
      }

      const resolvedAppId = appIdFromTrigger
      const resolvedApiToken = apiTokenFromTrigger
      if (!resolvedAppId) throw new Error('Missing GIM application ID')
      if (!resolvedApiToken) throw new Error('Missing GIM API token')

      const baseUrl = getGimBaseUrl(resolvedAppId)
      const url = `${baseUrl}/v1/applications/${resolvedAppId}/bots/${botProfile}/ask`

      // Create the provider request with proper message formatting
      const routes = Array.isArray(inputs.intentRoutes)
        ? inputs.intentRoutes.map((r: any) => ({
            routeTo: r?.routeTo || '',
            keywords: r?.keywords || '',
          }))
        : []
      const systemPrompt = generateIntentRouterPrompt(routes, userInput, targetBlocks)
      logger.info(`[VyinIntentRouter] Final system prompt: ${systemPrompt}`)

      logger.info('[VyinIntentRouter] Prepared params', {
        hasUrl: !!url,
        hasToken: !!resolvedApiToken,
        hasBotId: !!botProfile,
        hasPrompt: !!userInput,
      })

      const result = await executeTool(
        toolId,
        {
          url,
          apiToken: resolvedApiToken,
          botId: botProfile,
          prompt: systemPrompt, // TODO: Remove this after GIM API supports system prompt
          systemPrompt,
          _context: {
            workflowId: context.workflowId,
            workspaceId: context.workspaceId,
          },
        },
        false,
        false,
        context
      )

      if (!result.success) {
        const err = new Error(result.error || 'vyin_bot_assistant failed')
        Object.assign(err, {
          blockId: block.id,
          blockName: block.metadata?.name || 'Intent Router',
          output: result.output || {},
        })
        throw err
      }

      const responseText = String((result.output as any)?.response || '').trim().toLowerCase()

      const chosenBlockId = responseText
      const chosenBlock = targetBlocks?.find((b) => b.id === chosenBlockId)

      if (!chosenBlock) {
        logger.error(
          `Invalid routing decision. Response content: "${responseText}", available blocks:`,
          targetBlocks?.map((b) => ({ id: b.id, title: b.title })) || []
        )
        throw new Error(`Invalid routing decision: ${chosenBlockId}`)
      }

      const output = {
        userInput: String(inputs.userInput || ''),
        selectedPath: {
          blockId: chosenBlock.id,
          blockType: chosenBlock.type || 'unknown',
          blockTitle: chosenBlock.title || 'Untitled Block',
        },
      } as any
      return output
    } catch (error) {
      logger.error('Router execution failed:', error)
      throw error
    }
  }

  /**
   * Gets all potential target blocks for this router.
   *
   * @param block - Router block
   * @param context - Current execution context
   * @returns Array of potential target blocks with metadata
   * @throws Error if target block not found
   */
  private getTargetBlocks(block: SerializedBlock, context: ExecutionContext) {
    // Get IDs of blocks that come before this router (previous nodes)
    const previousBlockIds = new Set(
      context.workflow?.connections
        .filter((conn) => conn.target === block.id)
        .map((conn) => conn.source) || []
    )

    return context.workflow?.connections
      .filter((conn) => conn.source === block.id)
      .map((conn) => {
        const targetBlock = context.workflow?.blocks.find((b) => b.id === conn.target)
        if (!targetBlock) {
          throw new Error(`Target block ${conn.target} not found`)
        }

        // Extract system prompt for agent blocks
        let systemPrompt = ''
        if (targetBlock.metadata?.id === BlockType.AGENT) {
          // Try to get system prompt from different possible locations
          systemPrompt =
            targetBlock.config?.params?.systemPrompt || targetBlock.inputs?.systemPrompt || ''

          // If system prompt is still not found, check if we can extract it from inputs
          if (!systemPrompt && targetBlock.inputs) {
            systemPrompt = targetBlock.inputs.systemPrompt || ''
          }
        }

        return {
          id: targetBlock.id,
          type: targetBlock.metadata?.id,
          title: targetBlock.metadata?.name,
          description: targetBlock.metadata?.description,
          subBlocks: {
            ...targetBlock.config.params,
            systemPrompt: systemPrompt,
          },
          currentState: context.blockStates.get(targetBlock.id)?.output,
        }
      })
      .filter((targetBlock) => !previousBlockIds.has(targetBlock.id))
  }
}
