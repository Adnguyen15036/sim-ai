import { createLogger } from '@/lib/logs/console/logger'
import { getGimBaseUrl } from '@/lib/gim'

const logger = createLogger('VyinMessages')

export interface FormattedHistoryOptions {
  appId: string
  channelUrl: string
  apiToken: string
  botUserId: string
}

/**
 * Fetch messages from a Vyin/GIM group channel and format them for prompts.
 * Returns a newline-joined transcript prefixed by role labels: "Agent:" or "User:".
 */
export async function fetchAndFormatMessageHistory(options: FormattedHistoryOptions): Promise<string> {
  const { appId, channelUrl, apiToken, botUserId } = options
  try {
    const base = getGimBaseUrl(appId)
    if (!base) {
      logger.warn('[VyinMessages] Missing base URL')
      return ''
    }
    const url = `${base}/v2/group_channels/${encodeURIComponent(channelUrl)}/messages?message_ts=9999999999999`

    logger.info('[VyinMessages] Fetching message history', { url, channelUrl })

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Api-Token': apiToken,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      logger.error('[VyinMessages] Failed to fetch message history', {
        status: response.status,
        statusText: response.statusText,
      })
      return ''
    }

    const data: any = await response.json()
    const messages: any[] = data?.messages || []
    if (!Array.isArray(messages) || messages.length === 0) {
      logger.info('[VyinMessages] No messages found in channel')
      return ''
    }

    const formatted = messages
      .map((msg: any) => {
        const isBot = msg?.user?.user_id === botUserId
        const role = isBot ? 'Agent' : 'User'
        return `${role}: ${msg?.message ?? ''}`
      })
      .join('\n')

    logger.info('[VyinMessages] Formatted message history', {
      messageCount: messages.length,
      previewLength: formatted.length,
    })
    return formatted
  } catch (error: any) {
    logger.error('[VyinMessages] Error fetching message history', { error: error?.message })
    return ''
  }
}


