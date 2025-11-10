import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { CODE_TTL_SECONDS, generateCode, storeCode } from '@/lib/auth/internal/embed-session'
import { verifySignedRequest } from '@/lib/auth/internal/signed-request'

const logger = createLogger('EmbedSessionInit')


export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const verify = await verifySignedRequest(request, rawBody)
    if (!verify.ok) {
      return NextResponse.json({ error: verify.error || 'Unauthorized' }, { status: 401 })
    }

    // Parse once after signature verification
    let body: any = {}
    try {
      body = rawBody ? JSON.parse(rawBody) : {}
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { workspaceId, workflowId, redirectTo, appId } = body || {}
    if (!workspaceId || !workflowId || !appId) {
      return NextResponse.json({ error: 'workspaceId, workflowId and appId required' }, { status: 400 })
    }

    // Issue short-lived one-time code
    const code = generateCode()
    await storeCode(
      code,
      {
        workspaceId,
        workflowId,
        appId,
        redirectTo: typeof redirectTo === 'string' ? redirectTo : undefined,
        iat: Date.now(),
        ttl: CODE_TTL_SECONDS,
      },
      CODE_TTL_SECONDS
    )

    logger.info('Issued embed one-time code')
    return NextResponse.json({ code, expiresIn: CODE_TTL_SECONDS })
  } catch (error: any) {
    logger.error('init error', { message: error?.message, stack: error?.stack })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
