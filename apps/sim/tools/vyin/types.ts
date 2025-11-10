import type { ToolResponse } from '@/tools/types'

export interface VyinSendMessageRequest {
  url: string
  botUserId: string
  apiToken: string
  metaarray: Record<string, any>[]
  message: string
}

export interface VyinSendMessageResponse extends ToolResponse {
  output: {
    data: object
  }
}

export interface VyinMessage {
  message_id: number
  type: string
  custom_type: string
  channel_url: string
  user: {
    user_id: string
    nickname: string
  }
  mention_type: string
  is_removed: boolean
  message: string
  data: string
  sorted_metaarray: Record<string, any>[]
  message_events: any | null
  created_at: number
  updated_at: number
  is_apple_critical_alert: boolean
  file: {
    name: string
    url: string
    type: string
    size: number
    upload_at: string
    object_id: string | null
    object_status: string | null
    duration: number | null
  }
}

export interface VyinBotAssistantRequest {
  url: string
  apiToken: string
  botId: string
  prompt: string
  systemPrompt?: string
}
  
export interface VyinBotAssistantResponse extends ToolResponse {
  output: {
    response: string
  }
}

