import { ConnectIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

interface IntentRouterResponse extends ToolResponse {
  output: {
    prompt: string
    botProfile: string
    selectedPath: {
      blockId: string
      blockType: string
      blockTitle: string
    }
  }
}

interface TargetBlock {
  id: string
  type?: string
  title?: string
  description?: string
  category?: string
  subBlocks?: Record<string, any>
  currentState?: any
}

export const generateIntentRouterPrompt = (
  routes: Array<{ routeTo: string; keywords: string }>,
  userInput: string,
  targetBlocks?: TargetBlock[]
): string => {
  const basePrompt = `You are an intelligent routing agent responsible for directing workflow requests to the most appropriate block. Your task is to analyze the input and determine the single most suitable destination based on the request.

Key Instructions:
1. You MUST choose exactly ONE destination from the IDs of the blocks in the workflow. The destination must be a valid block id.

2. Analysis Framework:
   - Carefully evaluate the intent and requirements of the request
   - Consider the primary action needed
   - Match the core functionality with the most appropriate destination`

  // Available Target Blocks section (optional but preserves template location/order)
  const availableBlocksSection = targetBlocks
    ? `

Available Target Blocks:
${targetBlocks
  .map(
    (block) => `
ID: ${block.id}
Type: ${block.type}
Title: ${block.title}
Description: ${block.description}
System Prompt: ${JSON.stringify(block.subBlocks?.systemPrompt || '')}
Configuration: ${JSON.stringify(block.subBlocks, null, 2)}
${block.currentState ? `Current State: ${JSON.stringify(block.currentState, null, 2)}` : ''}
---`
  )
  .join('\n')}`
    : ''

  const routingInstructionsSection = `
Routing Instructions:
1. Analyze the input request carefully against each block's:
   - Primary purpose (from title, description, and system prompt)
   - Look for keywords in the system prompt that match the user's request
   - Configuration settings
   - Current state (if available)
   - Processing capabilities

2. Selection Criteria:
   - Choose the block that best matches the input's requirements
   - Consider the block's specific functionality and constraints
   - Factor in any relevant current state or configuration
   - Prioritize blocks that can handle the input most effectively`

  const routingRulesSection =
    Array.isArray(routes) && routes.length > 0
    ? `

Routing Rules:
${routes
  .map((r) => {
    const cleanedKeywords = (r.keywords || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .join("', '")
    return `- Route to '${r.routeTo}' if the user mentions keywords:\n'${cleanedKeywords}'`
  })
  .join('\n')}`
    : ''

  const userInputSection = `
Input to analyze: ${userInput}
`

  return `${basePrompt}${availableBlocksSection}
${routingInstructionsSection}
${routingRulesSection}
${userInputSection}

Response Format:
Return ONLY the destination id as a single word, lowercase, no punctuation or explanation.
Example: "2acd9007-27e8-4510-a487-73d3b825e7c1"

Remember: Your response must be ONLY the block ID - no additional text, formatting, or explanation.`
}

export const VyinIntentRouterBlock: BlockConfig<IntentRouterResponse> = {
  type: 'vyin_intent_router',
  name: 'Intent Router',
  description: 'Route workflow based on intent',
  longDescription:
    'Intelligently direct workflow execution to different paths based on input analysis using bot profile AI models. Use natural language to instruct the router to route to certain blocks based on the input.',
  bestPractices: `
    - For the prompt, make it almost programmatic. Use the system prompt to define the routing criteria. Should be very specific with no ambiguity.
    - Use the target block *names* to define the routing criteria.
    - The selected bot profile's AI model will be used for routing decisions.
    `,
  category: 'blocks',
  bgColor: '#000',
  icon: ConnectIcon,
  subBlocks: [
    {
      id: 'botProfile',
      title: 'Bot',
      type: 'vyin-bot-selector',
      layout: 'full',
      placeholder: 'Select a bot',
      description: 'Select a Vyin bot from your application',
      required: true,
    },
    {
      id: 'userInput',
      title: 'User Input',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Hello, how are you?',
      description: 'The user input to compare against the intent routes',
      required: true,
    },
    {
      id: 'intentRoutes',
      title: 'Intent Routes',
      type: 'vyin-intent-router-format',
      layout: 'full',
      description: 'Define keywords and routing destinations for different intents. Keywords are comma separated.',
    },
    {
      id: 'systemPrompt',
      title: 'System Prompt',
      type: 'code',
      layout: 'full',
      hidden: true,
      value: (params: Record<string, any>) => {
        const routes = Array.isArray(params.intentRoutes)
          ? params.intentRoutes.map((r: any) => ({
              routeTo: r?.routeTo || '',
              keywords: r?.keywords || '',
            }))
          : []
        return generateIntentRouterPrompt(routes, String(params.userInput || ''))
      },
    },
  ],
  tools: {
    access: ['vyin_bot_assistant'],
    config: {
      tool: () => 'vyin_bot_assistant',
    },
  },
  inputs: {
    botProfile: { type: 'string', description: 'Selected bot profile ID' },
    userInput: { type: 'string', description: 'Routing prompt content' },
    intentRoutes: {
      type: 'json',
      description: 'Intent routing rules',
    },
  },
  outputs: {
    userInput: { type: 'string', description: 'User input' },
    botProfile: { type: 'string', description: 'Bot used' },
    selectedPath: { type: 'json', description: 'Selected routing path' },
    // fallback: { type: 'any', description: 'Fallback path when routing fails' },
  },
}
