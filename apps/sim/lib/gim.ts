import { env } from '@/lib/env'

/**
 * Build the GIM base URL from the given appId.
 *
 * If baseUrlRaw is provided, it will be used; otherwise, falls back to env.GIM_BASE_URL.
 * A leading "@" in the base URL is stripped. If appId is provided, the subdomain
 * placeholder "gate" is replaced with the appId.
 */
export function getGimBaseUrl(appId: string, baseUrlRaw?: string): string {
  const raw = baseUrlRaw ?? env.GIM_BASE_URL ?? ''
  const normalizedBase = typeof raw === 'string' ? raw.replace(/^@/, '') : ''
  if (!normalizedBase) {
    return ''
  }
  if (!appId) {
    return normalizedBase
  }
  return normalizedBase.replace('gate', appId)
}

/**
 * Pure helper: extract GIM application credentials from a provided environment map.
 * envMap is a record of environment variables. Can be obtained from getEffectiveDecryptedEnv.
 */
export function getGimApplicationCredentials(
  envMap: Record<string, string | undefined>
): { appId?: string; apiToken?: string } {
  const appId =
    envMap['SYSTEM_MANAGED_GIM_APPLICATION_ID'] || envMap['GIM_APPLICATION_ID'] || undefined
  const apiToken =
    envMap['SYSTEM_MANAGED_GIM_APPLICATION_API_TOKEN'] ||
    envMap['GIM_APPLICATION_API_TOKEN'] ||
    undefined
  return { appId, apiToken }
}


