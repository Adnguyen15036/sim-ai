import type { BlockConfig } from '@/blocks/types'
import { VyinChatIcon } from '@/components/vyin-icons'

export const VyinChatbot: BlockConfig = {
  type: 'vyin_chatbot',
  triggerAllowed: true,
  name: 'Vyin Chatbot',
  description: 'Expose as HTTP API endpoint for Vyin chatbot',
  longDescription:
    'API trigger to start the workflow via authenticated HTTP calls with Vyin chatbot parameters.',
  bestPractices: `
  - Can run the workflow manually to test implementation when this is the trigger point.
  - In production, the API provides: content, api_token, sender_id, app_id, channel_url, bot_user_id, bot_uid, bot_nickname, bot_profile_url, bot_character, bot_metadata.
  - Access outputs using references like <vyin_chatbot1.content>, <vyin_chatbot1.bot_nickname>, etc.
  - The curl would come in as: curl -X POST -H "X-API-Key: $SIM_API_KEY" -H "Content-Type: application/json" -d '{"content":"Hello","api_token":"token","sender_id":"user123","app_id":"app456","channel_url":"https://...","bot_user_id":"bot1","bot_uid":"uid1","bot_nickname":"MyBot","bot_profile_url":"https://...","bot_character":"friendly","bot_metadata":{}}' https://www.staging.sim.ai/api/workflows/YOUR_WORKFLOW_ID/execute
  `,
  category: 'triggers',
  bgColor: '#000',
  icon: VyinChatIcon,
  subBlocks: [],
  tools: {
    access: [],
  },
  inputs: {},
  outputs: {
    content: { type: 'string', description: 'User message' },
    api_token: { type: 'string', description: 'API Token' },
    sender_id: { type: 'string', description: 'Sender ID' },
    app_id: { type: 'string', description: 'App ID' },
    channel_url: { type: 'string', description: 'Channel URL' },
    bot_user_id: { type: 'string', description: 'Bot User ID' },
    bot_uid: { type: 'string', description: 'Bot UID' },
    bot_nickname: { type: 'string', description: 'Bot Nickname' },
    bot_profile_url: { type: 'string', description: 'Bot Profile URL' },
    bot_character: { type: 'string', description: 'Bot Character' },
    bot_metadata: { type: 'json', description: 'Bot Metadata' },
  },
  triggers: {
    enabled: true,
    available: ['api'],
  },
}
