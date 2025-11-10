import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getEffectiveDecryptedEnv } from '@/lib/environment/utils'
import { getGimApplicationCredentials, getGimBaseUrl } from '@/lib/gim'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'

const logger = createLogger('GimBotDetailAPI')

interface GimBotDetailResponse {
  bot_id: string
  bot_userid: string
  bot_nickname: string
  bot_profile_url: string
  bot_metadata: Record<string, any>
  bot_engine_name?: string
  bot_engine_protocol?: string
  bot_engine_is_built_in: boolean
  bot_character?: string
  created_at: number
  using_sources_count?: number
  license_id?: string
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const requestId = generateRequestId()

  try {
    const session = await getSession()
    const userId = session?.user?.id
    if (!userId) {
      logger.warn(`[${requestId}] Unauthorized request (no session)`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const envMap = await getEffectiveDecryptedEnv(userId, undefined)
    const { appId, apiToken } = getGimApplicationCredentials(envMap)

    const botId = params.id

    if (!appId || !apiToken || !botId) {
      logger.warn(`[${requestId}] Missing required parameters`)
      return NextResponse.json(
        { error: 'Missing required parameters: appId, apiToken, and botId' },
        { status: 400 }
      )
    }

    const apiUrl = `${getGimBaseUrl(appId)}/v2/applications/${appId}/bots/${botId}`

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Api-Token': apiToken,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`[${requestId}] GIM API error: ${response.status} ${errorText}`)
      return NextResponse.json(
        {
          error: `Failed to fetch bot detail from GIM API: ${response.status} ${response.statusText}`,
        },
        { status: response.status }
      )
    }

    const responseText = await response.text()
    const fixedResponseText = responseText
      .replace(/"bot_id":\s*(\d+)/g, '"bot_id":"$1"')
      .replace(/"license_id":\s*(\d+)/g, '"license_id":"$1"')

    const data: GimBotDetailResponse = JSON.parse(fixedResponseText)

    logger.info(`[${requestId}] Successfully fetched bot detail for botId: ${botId}`)

    return NextResponse.json(data)
  } catch (error) {
    logger.error(`[${requestId}] Error fetching GIM bot detail:`, error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
