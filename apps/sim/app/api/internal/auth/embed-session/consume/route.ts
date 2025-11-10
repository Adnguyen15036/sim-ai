import { db } from '@sim/db'
import { workspace } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { embedCookie, signEmbedToken } from '@/lib/auth/embed'
import { env } from '@/lib/env'
import { createLogger } from '@/lib/logs/console/logger'
import { consumeCode } from '@/lib/auth/internal/embed-session'
import { getDeterministicServiceAccount } from '@/lib/auth/internal/deterministic-account'

const logger = createLogger('EmbedSessionConsume')

function isAllowedRedirect(url: URL): boolean {
  try {
    const appUrl = new URL(env.NEXT_PUBLIC_APP_URL)
    return url.origin === appUrl.origin && url.pathname.startsWith('/')
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code') || ''

    if (!code) {
      return NextResponse.json({ error: 'code required' }, { status: 400 })
    }

    const data = await consumeCode(code)
    if (!data) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 })
    }

    const { workspaceId, workflowId, redirectTo, appId } = data as {
      workspaceId: string
      workflowId?: string
      redirectTo?: string
      appId?: string
    }

    // Ensure required inputs for deterministic service account
    if (!appId) {
      logger.error('Missing appId in embed consume payload', { workspaceId, workflowId })
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Resolve userId from workspace owner if present
    let userId: string | undefined
    const owner = await db
      .select({ ownerId: workspace.ownerId })
      .from(workspace)
      .where(eq(workspace.id, workspaceId))
      .limit(1)
    userId = owner?.[0]?.ownerId

    // Deterministic service account for this appId
    const { email, password } = getDeterministicServiceAccount(appId)

    // Attempt to ensure BetterAuth session via deterministic account
    let setCookieValue: string | null = null
    try {
      const { headers: signupHeaders } = await auth.api.signUpEmail({
        returnHeaders: true,
        body: {
          email,
          password,
          name: 'GIM App',
        },
      })
      setCookieValue = signupHeaders?.get('set-cookie') || null
      logger.info('Service account created via embed consume', { email, workspaceId, appId })
    } catch (e: any) {
      const { headers: signinHeaders } = await auth.api.signInEmail({
        returnHeaders: true,
        body: {
          email,
          password,
        },
      })
      setCookieValue = signinHeaders?.get('set-cookie') || null
      logger.info('Service account signed in via embed consume', { email, workspaceId, appId })
    }

    // Mint embed token and set cookie
    const token = await signEmbedToken({
      workspaceId,
      workflowId,
      userId,
      ttlSeconds: 24 * 60 * 60,
    })

    const res = new NextResponse(null, { status: 204 })
    if (setCookieValue) {
      res.headers.set('set-cookie', setCookieValue)
    }
    res.cookies.set(embedCookie.name, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 24 * 60 * 60,
    })

    // Optional redirect
    if (redirectTo) {
      try {
        const to = new URL(redirectTo, env.NEXT_PUBLIC_APP_URL)
        if (isAllowedRedirect(to)) {
          return NextResponse.redirect(to)
        }
      } catch {}
    }

    return res
  } catch (error: any) {
    logger.error('consume error', { message: error?.message, stack: error?.stack })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
