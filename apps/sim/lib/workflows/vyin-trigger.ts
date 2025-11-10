import type { ExecutionContext } from '@/executor/types'

export interface VyinChatTriggerPayload {
  content?: string
  api_token?: string
  sender_id?: string
  app_id?: string
  channel_url?: string
  bot_user_id?: string
  bot_uid?: string
  bot_nickname?: string
  bot_profile_url?: string
  bot_character?: string
  bot_metadata?: Record<string, any>
}

/**
 * Get payload from the Vyin Chatbot trigger block during execution.
 * Safe to call in any handler; returns empty object if not present.
 */
export function getVyinChatTriggerPayload(context: ExecutionContext): VyinChatTriggerPayload {
  const wf = context.workflow
  if (!wf) return {}

  const vyin = wf.blocks.find((b) => b.metadata?.id === 'vyin_chatbot')
  if (!vyin) return {}

  const out = context.blockStates.get(vyin.id)?.output as Record<string, any> | undefined
  if (!out) return {}

  return {
    content: out.content,
    api_token: out.api_token,
    sender_id: out.sender_id,
    app_id: out.app_id,
    channel_url: out.channel_url,
    bot_user_id: out.bot_user_id,
    bot_uid: out.bot_uid,
    bot_nickname: out.bot_nickname,
    bot_profile_url: out.bot_profile_url,
    bot_character: out.bot_character,
    bot_metadata: out.bot_metadata,
  }
}


