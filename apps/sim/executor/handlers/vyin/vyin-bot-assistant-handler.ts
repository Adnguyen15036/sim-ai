import { createLogger } from '@/lib/logs/console/logger'
import { getVyinChatTriggerPayload } from '@/lib/workflows/vyin-trigger'
import type { BlockHandler, ExecutionContext } from '@/executor/types'
import type { SerializedBlock } from '@/serializer/types'
import { executeTool } from '@/tools'
import { getTool } from '@/tools/utils'
import { getGimBaseUrl } from '@/lib/gim'
import { fetchAndFormatMessageHistory } from '@/lib/vyin/messages'
import { buildVyinBotPrompts } from '@/lib/vyin/prompts'

const logger = createLogger('VyinBotAssistantBlockHandler')

export class VyinBotAssistantBlockHandler implements BlockHandler {
  canHandle(block: SerializedBlock): boolean {
    return block.metadata?.id === 'vyin_bot_assistant'
  }

  async execute(
    block: SerializedBlock,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    logger.info(`Executing Vyin Bot Assistant block: ${block.id}`)

    const tool = getTool(block.config.tool)
    if (!tool) {
      throw new Error(`Tool not found: ${block.config.tool}`)
    }

    // Build params from trigger payload and inputs
    const vyin = getVyinChatTriggerPayload(context)
    const appId = (vyin.app_id || '').trim()
    const apiTokenFromTrigger = (vyin.api_token || '').trim()
    const botId = (vyin.bot_uid || inputs.botId || '').trim()
    const channelUrl = (vyin.channel_url || '').trim()
    const botUserId = (vyin.bot_user_id || '').trim()
    const systemPrompt = (inputs.systemPrompt || '').toString()
    const prompt = (inputs.prompt || '').toString()
    const includeHistory = Boolean(inputs.includeHistory)

    if (!botId) {
      throw new Error('Bot ID is required (from trigger or input)')
    }
    if (!prompt) {
      throw new Error('Prompt is required')
    }
    if (includeHistory && (!channelUrl || !botUserId)) {
      logger.warn('[VyinBotAssistant] includeHistory enabled but missing channelUrl or botUserId', {
        hasChannelUrl: !!channelUrl,
        hasBotUserId: !!botUserId,
      })
    }

    // Resolve credentials from trigger payload (consistent with VyinChatResponse)
    let resolvedAppId = appId
    let resolvedApiToken = apiTokenFromTrigger
    if (!resolvedAppId) throw new Error('Missing GIM application ID')
    if (!resolvedApiToken) throw new Error('Missing GIM API token')

    const base = getGimBaseUrl(resolvedAppId)
    const url = `${base}/v1/applications/${resolvedAppId}/bots/${botId}/ask`

    // Compose final prompts (system + optional history + user)
    let history: string | '' = ''
    if (includeHistory && channelUrl && botUserId) {
      history = await fetchAndFormatMessageHistory({
        appId: resolvedAppId,
        channelUrl,
        apiToken: resolvedApiToken,
        botUserId,
      })
    }
    // TODO: Need update when GIM API supports system prompt
    const { systemPrompt: finalSystemPrompt, userPrompt: finalUserPrompt } = buildVyinBotPrompts({
      systemPrompt: prompt,
      userPrompt: prompt,
      history,
      historyLabel: 'Recent conversation',
      maxHistoryChars: 4000,
    })

    logger.info(`[VyinBotAssistant] Final system prompt: ${finalSystemPrompt}`)
    logger.info(`[VyinBotAssistant] Final user prompt: ${finalUserPrompt}`)

    const finalInputs = {
      url,
      apiToken: resolvedApiToken,
      botId,
      prompt: finalSystemPrompt,
      systemPrompt: finalSystemPrompt,
    }

    logger.info('[VyinBotAssistant] Prepared params', {
      hasUrl: !!url,
      hasToken: !!resolvedApiToken,
      hasBotId: !!botId,
      hasPrompt: !!prompt,
      includeHistory,
      hasChannelUrl: !!channelUrl,
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
      const error = new Error(result.error || 'Vyin Bot Assistant failed')
      Object.assign(error, {
        blockId: block.id,
        blockName: block.metadata?.name || 'Vyin Bot Assistant',
        output: result.output || {},
      })
      throw error
    }

    return {
      ...result.output,
      historyConversation: history || undefined,
    }
  }
}


