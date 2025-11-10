import type { ToolConfig } from '@/tools/types'
import type {
  VyinMessage,
  VyinSendMessageRequest,
  VyinSendMessageResponse,
} from '@/tools/vyin/types'

export const vyinChatResponseTool: ToolConfig<VyinSendMessageRequest, VyinSendMessageResponse> = {
  id: 'vyin_chat_response',
  name: 'Vyin Chat Response Tool',
  description: 'Reply to bot message by sending a message to group channel',
  version: '1.0.0',

  params: {
    metaarray: {
      type: 'json',
      required: false,
      visibility: 'user-only',
      description: 'Sorted Metaarray',
    },
    message: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Message',
    },
  },

  request: {
    url: (params) => {
      return params.url
    },
    method: 'POST',
    headers: (params: VyinSendMessageRequest) => ({
      'Content-Type': 'application/json',
      'Api-Token': params.apiToken,
    }),
    body: (params: VyinSendMessageRequest) => {
      return {
        message: params.message,
        message_type: 'MESG',
        user_id: params.botUserId,
        sorted_metaarray: params.metaarray,
      }
    },
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to send message')
    }
    return {
      success: true,
      output: {
        data: data as VyinMessage,
      },
    }
  },

  outputs: {
    data: { type: 'json', description: 'Response data from Vyin Chat' },
  },
}



