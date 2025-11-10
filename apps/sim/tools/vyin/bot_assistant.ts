import type { ToolConfig } from '@/tools/types'
import type { VyinBotAssistantRequest, VyinBotAssistantResponse } from '@/tools/vyin/types'

export const vyinBotAssistantTool: ToolConfig<VyinBotAssistantRequest, VyinBotAssistantResponse> = {
  id: 'vyin_bot_assistant',
  name: 'Vyin Bot Assistant',
  description: 'Send prompts to a Vyin/GIM bot and receive responses',
  version: '1.0.0',

  params: {
    url: {
      type: 'string',
      required: true,
      description: 'Fully qualified API URL to call',
    },
    apiToken: {
      type: 'string',
      required: true,
      description: 'GIM API token for authentication',
    },
    botId: {
      type: 'string',
      required: true,
      description: 'GIM bot ID',
    },
    prompt: {
      type: 'string',
      required: true,
      description: 'Prompt to send to the bot',
    },
    systemPrompt: {
      type: 'string',
      required: false,
      description: 'Optional system prompt',
    },
  },

  request: {
    url: (params) => {
      if (!params.url || typeof params.url !== 'string') {
        throw new Error('vyin_bot_assistant: url is required')
      }
      return params.url
    },
    method: 'POST',
    headers: (params) => ({
      ...(params.apiToken ? { 'Api-Token': params.apiToken } : (() => { throw new Error('vyin_bot_assistant: apiToken is required') })()),
      'Content-Type': 'application/json',
    }),
    body: (params) => {
      const payload: any = {
        bot_id: params.botId,
        prompt: params.prompt,
      }
      if (params.systemPrompt) {
        payload.system_prompt = params.systemPrompt
      }
      return payload
    },
  },

  transformResponse: async (response: Response): Promise<VyinBotAssistantResponse> => {
    const data = await response.json()
    if (data.error || data.message) {
      throw new Error(data.error || data.message || 'GIM API error')
    }
    if (!data.response) {
      throw new Error('Invalid API response: missing response field')
    }
    return {
      success: true,
      output: {
        response: data.response,
      },
    }
  },

  outputs: {
    response: { type: 'string', description: 'Bot response text' },
  },
}


