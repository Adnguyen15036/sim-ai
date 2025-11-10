import { VyinChatIcon } from '@/components/vyin-icons'
import type { BlockConfig } from '@/blocks'
import type { VyinSendMessageResponse } from '@/tools/vyin/types'

export const VyinChatResponse: BlockConfig<VyinSendMessageResponse> = {
  type: 'vyin_chat_response',
  name: 'Vyin Chat Response',
  description: 'Vyin Chat Response',
  longDescription: 'Vyin Chat Response',
  docsLink: '',
  category: 'blocks',
  bgColor: '#000',
  icon: VyinChatIcon,
  subBlocks: [
    {
      id: 'dataMode',
      title: 'Response Data Mode',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: 'Builder', id: 'structured' },
        { label: 'Editor', id: 'json' },
      ],
      value: () => 'structured',
      description: 'Choose how to define your suggestion actions',
    },
    {
      id: 'metaarray',
      title: 'Suggestion Actions',
      type: 'vyin-response-format',
      layout: 'full',
      description: 'Ideal for quick replies or guiding users through predefined choices',
      condition: { field: 'dataMode', value: 'structured' },
    },
    {
      id: 'suggestionType',
      title: 'Suggestion Actions',
      type: 'dropdown',
      layout: 'full',
      options: [{ label: 'Button', id: 'buttons_suggestion' }],
      value: () => 'buttons_suggestion',
      condition: { field: 'dataMode', value: 'json' },
      description: 'Select the suggestion action type for the editor value',
    },
    {
      id: 'editorValue',
      title: 'Value',
      type: 'code',
      layout: 'full',
      description:
        'Provide an array of suggestion actions (e.g., Button). JSON only. Example: [{"type":"message","content":"Buy now","message":"I want to buy"}]',
      condition: { field: 'dataMode', value: 'json' },
      language: 'json',
      generationType: 'json-object',
      placeholder:
        '[\n  { "type": "hyperlink", "content": "Open website", "link": "https://x.com" }\n]',
    },
    {
      id: 'message',
      title: 'Message',
      type: 'long-input',
      layout: 'full',
      required: true,
      placeholder: 'Enter Message...',
    },
  ],
  tools: {
    access: ['vyin_chat_response'],
    config: {
      tool: () => 'vyin_chat_response',
      // Keep tool static; compute params depending on mode
      params: (params: Record<string, any>) => {
        const mode = params?.dataMode || 'structured'
        let metaarray = params?.metaarray
        const suggestionKey =
          typeof params?.suggestionType === 'string' && params?.suggestionType.trim().length > 0
            ? params.suggestionType
            : 'buttons_suggestion'

        if (mode === 'json') {
          const editor = params?.editorValue
          const raw =
            typeof editor === 'string'
              ? editor
              : typeof editor === 'object' && editor
                ? editor.value ?? editor
                : undefined
          if (raw !== undefined) {
            try {
              // Allow both direct array JSON and variable reference strings
              if (typeof raw === 'string') {
                const trimmed = raw.trim()
                if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
                  // Variable reference; pass through
                  metaarray = trimmed
                } else if (trimmed.length > 0) {
                  const parsed = JSON.parse(trimmed)
                  if (Array.isArray(parsed)) {
                    // If already metaarray (first item has key + value array)
                    if (parsed?.[0]?.key && Array.isArray(parsed?.[0]?.value)) {
                      metaarray = parsed
                    } else {
                      // Treat as array of items for the selected suggestion type; wrap
                      metaarray = [
                        {
                          key: suggestionKey,
                          value: parsed,
                        },
                      ]
                    }
                  } else if (
                    Array.isArray(parsed?.value) &&
                    (parsed?.key || parsed?.key === 'buttons_suggestion')
                  ) {
                    // Single object with key/value already
                    metaarray = [parsed]
                  } else if (Array.isArray(parsed?.[0]?.value) && parsed?.[0]?.key) {
                    // Already metaarray array
                    metaarray = parsed
                  } else {
                    // Fallback: leave undefined to surface validation later
                    metaarray = undefined
                  }
                }
              } else {
                // If somehow we get object/array directly from serializer
                if (Array.isArray(raw as any)) {
                  const arr = raw as any[]
                  metaarray =
                    arr?.[0]?.key && Array.isArray(arr?.[0]?.value)
                      ? arr
                      : [
                          {
                            key: suggestionKey,
                            value: arr,
                          },
                        ]
                } else {
                  metaarray = raw
                }
              }
            } catch {
              // Leave metaarray undefined to surface validation error later in executor
              metaarray = undefined
            }
          }
        }

        return {
          metaarray,
          message: params?.message,
        }
      },
    },
  },
  inputs: {
    dataMode: { type: 'string', description: 'Response data definition mode' },
    metaarray: { type: 'json', description: 'Sorted metadata (Builder mode)' },
    suggestionType: {
      type: 'string',
      description: 'Suggestion action key (Editor mode)',
    },
    editorValue: {
      type: 'json',
      description: 'JSON array of suggestion actions (Editor mode)',
      schema: {
        type: 'array',
        properties: {},
        items: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    message: { type: 'string', description: 'Message you want to send' },
  },
  outputs: {
    // Tool outputs
    data: { type: 'json', description: 'Response data from Vyin Chat' },
  },
}
