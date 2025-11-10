import { env } from './env'

/**
 * Returns the set of system-managed user environment variable keys.
 * Reads from env.SYSTEM_MANAGED_USER_ENV_KEYS (comma-separated). Defaults include:
 * - SYSTEM_MANAGED_GIM_APPLICATION_API_TOKEN
 * - SYSTEM_MANAGED_GIM_APPLICATION_ID
 */
export function getSystemManagedUserEnvKeysSet(): Set<string> {
  // Include both new prefixed names and legacy names for backward compatibility
  const defaults = [
    'SYSTEM_MANAGED_GIM_APPLICATION_API_TOKEN',
    'SYSTEM_MANAGED_GIM_APPLICATION_ID',
    'GIM_APPLICATION_API_TOKEN',
    'GIM_APPLICATION_ID',
  ]
  const raw = env.SYSTEM_MANAGED_USER_ENV_KEYS || ''
  const parsed =
    typeof raw === 'string'
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : []
  const keys = new Set<string>([...defaults, ...parsed])
  return keys
}


