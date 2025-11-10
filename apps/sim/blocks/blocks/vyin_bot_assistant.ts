import { VyinBotIcon } from '@/components/vyin-icons'
import type { BlockConfig } from '@/blocks/types'

export const VyinBotAssistantBlock: BlockConfig = {
  type: 'vyin_bot_assistant',
  name: 'Vyin Bot Assistant',
  description: 'Interact with Vyin/GIM bots using your configured application credentials',
  longDescription:
    'Send prompts to a Vyin/GIM bot and receive AI-powered responses. When used with the Vyin Chat trigger, credentials are resolved automatically from the trigger payload or user environment.',
  docsLink: '',
  category: 'blocks',
  bgColor: '#000',
  icon: VyinBotIcon,
  subBlocks: [
    {
      id: 'botId',
      title: 'Bot',
      type: 'vyin-bot-selector',
      layout: 'full',
      placeholder: 'Select a bot',
      required: true,
      description: 'Select a Vyin bot from your application',
    },
    {
      id: 'systemPrompt',
      title: 'System Prompt',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Enter your system prompt for the bot...',
      required: false,
      rows: 4,
    },
    {
      id: 'prompt',
      title: 'User Prompt',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Enter your prompt for the bot...',
      required: true,
      rows: 3,
    },
    {
      id: 'includeHistory',
      title: 'Include message history',
      type: 'switch',
      layout: 'full',
      defaultValue: false,
      description:
        'Include previous messages from the channel as context (requires Vyin Chat trigger)',
    },
    {
      id: 'temperature',
      title: 'Temperature',
      type: 'slider',
      layout: 'half',
      min: 0,
      max: 2,
      step: 0.1,
      description: 'Controls randomness (0.0 = deterministic, 2.0 = very random)',
      hidden: true,
    },
    {
      id: 'maxTokens',
      title: 'Max Tokens',
      type: 'short-input',
      layout: 'half',
      placeholder: '1000',
      description: 'Maximum tokens used by the bot',
      hidden: true,
    },
  ],

  tools: {
    access: ['vyin_bot_assistant'],
    config: {
      tool: () => 'vyin_bot_assistant',
      params: (params) => {
        if (!params.prompt) {
          throw new Error('Prompt is required')
        }
        if (!params.botId) {
          throw new Error('Bot is required')
        }
        return {
          // url and apiToken are resolved by the handler at runtime
          botId: params.botId,
          systemPrompt: params.systemPrompt,
          prompt: params.prompt,
          // History-related params (handler will fetch & append to systemPrompt)
          includeHistory: params.includeHistory || false,
        }
      },
    },
  },

  inputs: {
    botId: { type: 'string', description: 'GIM bot ID' },
    systemPrompt: { type: 'string', description: 'System prompt for the bot' },
    prompt: { type: 'string', description: 'Prompt to send to the bot' },
    includeHistory: { type: 'boolean', description: 'Include message history from channel' },
    temperature: { type: 'number', description: 'Hidden: temperature' },
    maxTokens: { type: 'number', description: 'Hidden: max tokens' },
  },

  outputs: {
    response: { type: 'string', description: 'Bot response text' },
    historyConversation: { type: 'string', description: 'Chat history conversation' },
  },
}
