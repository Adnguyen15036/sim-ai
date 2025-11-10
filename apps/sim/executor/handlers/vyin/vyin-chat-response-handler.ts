import { getGimBaseUrl } from '@/lib/gim'
import { createLogger } from '@/lib/logs/console/logger'
import { getVyinChatTriggerPayload } from '@/lib/workflows/vyin-trigger'
import type { BlockHandler, ExecutionContext } from '@/executor/types'
import type { SerializedBlock } from '@/serializer/types'
import { executeTool } from '@/tools'
import { getTool } from '@/tools/utils'
import { getBlock } from '@/blocks'

const logger = createLogger('VyinChatResponseBlockHandler')

export class VyinChatResponseBlockHandler implements BlockHandler {
  canHandle(block: SerializedBlock): boolean {
    return block.metadata?.id === 'vyin_chat_response'
  }

  async execute(
    block: SerializedBlock,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    logger.info(`Executing Vyin Chat Response block: ${block.id}`)
    const tool = getTool(block.config.tool)
    if (!tool) {
      throw new Error(`Tool not found: ${block.config.tool}`)
    }

    // Build params from trigger payload
    const vyin = getVyinChatTriggerPayload(context)

    const appId = (vyin.app_id || '').trim()
    const channel = (vyin.channel_url || '').trim()
    const apiToken = (vyin.api_token || '').trim()
    const botUserId = (vyin.bot_user_id || '').trim()

    const base = getGimBaseUrl(appId)
    const path = channel ? `/v2/group_channels/${encodeURIComponent(channel)}/messages` : ''
    const url = `${base}${path}`

    // Apply block-level parameter transformation (builder/editor → tool params)
    try {
      const blockConfig = getBlock('vyin_chat_response')
      if (blockConfig?.tools?.config?.params) {
        const transformed = blockConfig.tools.config.params(inputs)
        inputs = { ...inputs, ...transformed }
      }
    } catch {}

    const finalInputs = {
      ...inputs,
      url,
      apiToken,
      botUserId,
    }

    logger.info('[VyinChatResponse] Prepared params', {
      hasUrl: !!url,
      hasToken: !!apiToken,
      hasBotUserId: !!botUserId,
    })

    const result = await executeTool(
      block.config.tool,
      {
        ...finalInputs,
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
      const error = new Error(result.error || 'Vyin Chat Response failed')
      Object.assign(error, {
        blockId: block.id,
        blockName: block.metadata?.name || 'Vyin Chat Response',
        output: result.output || {},
      })
      throw error
    }

    return result.output
  }
}
