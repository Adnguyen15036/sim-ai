import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getEffectiveDecryptedEnv } from '@/lib/environment/utils'
import { getGimApplicationCredentials, getGimBaseUrl } from '@/lib/gim'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'

const logger = createLogger('VyinBotsListAPI')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface GimApiResponse {
  count: number
  previous: string | null
  next: string | null
  results: Array<{
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
  }>
}

export async function GET(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const url = new URL(request.url)
    const pageToken = url.searchParams.get('pageToken') || undefined

    // Resolve user from session
    const session = await getSession()
    const userId = session?.user?.id
    if (!userId) {
      logger.warn(`[${requestId}] Unauthorized request (no session)`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Load merged decrypted environment (personal only by default)
    const envMap = await getEffectiveDecryptedEnv(userId, undefined)
    const { appId, apiToken } = getGimApplicationCredentials(envMap)

    if (!appId || !apiToken) {
      logger.warn(`[${requestId}] Missing required GIM credentials (appId/apiToken)`)
      return NextResponse.json(
        {
          error:
            'Missing required GIM credentials. Please configure SYSTEM_MANAGED_GIM_APPLICATION_ID and SYSTEM_MANAGED_GIM_APPLICATION_API_TOKEN in Environment.',
        },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Fetching GIM bots for appId: ${appId}`)
    const base = getGimBaseUrl(appId)
    const params = new URLSearchParams()
    params.set('limit', '20') // default limit
    if (pageToken) {
      params.set('token', pageToken) // pass through to GIM API
    }
    const apiUrl = `${base}/v2/applications/${appId}/bots?${params.toString()}`

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
          error: `Failed to fetch bots from GIM API: ${response.status} ${response.statusText}`,
        },
        { status: response.status }
      )
    }

    // Parse response as text and wrap large integer IDs in quotes before JSON parsing
    // This prevents precision loss for values exceeding Number.MAX_SAFE_INTEGER
    const responseText = await response.text()
    const fixedResponseText = responseText
      .replace(/"bot_id":\s*(\d+)/g, '"bot_id":"$1"')
      .replace(/"license_id":\s*(\d+)/g, '"license_id":"$1"')

    const data: GimApiResponse = JSON.parse(fixedResponseText)

    logger.info(`[${requestId}] Successfully fetched ${data.results?.length || 0} bots`)

    return NextResponse.json({
      bots: data.results || [],
      total: data.count || 0,
      next: data.next,
      previous: data.previous,
    })
  } catch (error) {
    logger.error(`[${requestId}] Error fetching GIM bots:`, error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
