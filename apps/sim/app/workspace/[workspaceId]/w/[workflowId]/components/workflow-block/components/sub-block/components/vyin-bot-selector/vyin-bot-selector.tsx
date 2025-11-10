import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-sub-block-value'
import type { SubBlockConfig } from '@/blocks/types'

export interface VyinBotInfo {
  bot_id: string
  bot_nickname: string
  bot_userid: string
}

interface VyinBotSelectorProps {
  blockId: string
  subBlock: SubBlockConfig
  disabled?: boolean
  isPreview?: boolean
  previewValue?: string | null
}

export function VyinBotSelector({
  blockId,
  subBlock,
  disabled = false,
  isPreview = false,
  previewValue,
}: VyinBotSelectorProps) {
  const BOT_API_BASE_URL = '/api/tools/vyin/bots'
  const BOT_LIST_ERROR = 'Fail to fetch bots'
  const placeholder = subBlock.placeholder || 'Select Vyin bot'

  const [bots, setBots] = useState<VyinBotInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [pageToken, setPageToken] = useState<string | null>(null)
  const [storeValue, setStoreValue] = useSubBlockValue(blockId, subBlock.id)

  const value = isPreview && previewValue !== undefined ? previewValue : storeValue

  const resetData = useCallback(() => {
    setBots([])
    setPageToken(null)
  }, [])

  const fetchBots = useCallback(async () => {
    if (loading) return

    setLoading(true)
    setError(null)

    const url = pageToken ? `${BOT_API_BASE_URL}?pageToken=${pageToken}` : BOT_API_BASE_URL

    try {
      const response = await fetch(url)

      if (!response.ok) {
        setError(BOT_LIST_ERROR)
        resetData()
        return
      }

      const data = await response.json()

      if (data.error) {
        setError(data.error)
        resetData()
        return
      }

      setBots((prevBots) => {
        const existingIds = new Set(prevBots.map((b) => b.bot_id))
        const newBots = (data.bots || []).filter((bot: VyinBotInfo) => !existingIds.has(bot.bot_id))
        return [...prevBots, ...newBots]
      })
      setPageToken(data.next || null)
    } catch (err) {
      console.error('Error fetching bots:', err)
      setError(BOT_LIST_ERROR)
      resetData()
    } finally {
      setLoading(false)
    }
  }, [pageToken, loading, resetData])

  const fetchBotDetail = useCallback(async (botId: string) => {
    if (!botId) return null

    try {
      const response = await fetch(`${BOT_API_BASE_URL}/${botId}`)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      return data.bot
    } catch (err) {
      console.error('Error fetching bot detail:', err)
      return null
    }
  }, [])

  useEffect(() => {
    const initializeBots = async () => {
      const currentBotDetail = await fetchBotDetail(value)
      if (currentBotDetail) {
        setBots([currentBotDetail])
      }
      await fetchBots()
    }

    initializeBots()
  }, [])

  useEffect(() => {
    if (!open || !pageToken || loading) return

    let handleScroll: ((e: Event) => void) | null = null
    let container: HTMLElement | null = null
    let retryTimeoutId: NodeJS.Timeout | null = null
    let retryCount = 0
    const maxRetries = 20

    const findAndAttachScroll = () => {
      const selectors = ['[data-radix-select-viewport]', '[role="listbox"]']

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector)
        for (const el of elements) {
          const element = el as HTMLElement
          container = element
          break
        }
        if (container) break
      }

      if (!container && retryCount < maxRetries) {
        retryCount++
        retryTimeoutId = setTimeout(findAndAttachScroll, 150)
        return
      }

      if (!container) {
        const portals = document.querySelectorAll('[data-radix-portal]')
        for (const portal of portals) {
          const scrollable = portal.querySelector(
            'div[style*="overflow"], div.scrollbar-thin'
          ) as HTMLElement
          if (scrollable) {
            container = scrollable
            break
          }
        }
      }

      if (!container) return

      handleScroll = () => {
        if (!container || loading || !pageToken) return
        const { scrollTop, scrollHeight, clientHeight } = container
        const threshold = 100

        const distanceFromBottom = scrollHeight - scrollTop - clientHeight
        if (distanceFromBottom < threshold) fetchBots()
      }

      container.addEventListener('scroll', handleScroll, { passive: true })
    }

    const timeoutId = setTimeout(findAndAttachScroll, 300)

    return () => {
      clearTimeout(timeoutId)
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId)
      }
      if (container && handleScroll) {
        container.removeEventListener('scroll', handleScroll)
      }
    }
  }, [open, pageToken, loading, fetchBots])

  const handleSelectBot = (botId: string) => {
    const bot = bots.find((b) => b.bot_id === botId)
    if (bot && !isPreview && !disabled) {
      setStoreValue(bot.bot_id)
    }
    setOpen(false)
  }

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
  }

  return (
    <Select
      open={open}
      onOpenChange={handleOpenChange}
      value={value || undefined}
      onValueChange={handleSelectBot}
      disabled={disabled}
    >
      <SelectTrigger className='w-full'>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {loading && !pageToken && bots.length === 0 && (
          <div className='flex items-center justify-center p-4'>
            <RefreshCw className='h-4 w-4 animate-spin' />
            <span className='ml-2 text-sm'>Loading bots...</span>
          </div>
        )}

        {!loading && error && bots.length === 0 && (
          <div className='p-4 text-center'>
            <p className='text-destructive text-sm'>{error}</p>
          </div>
        )}

        {!loading && !error && bots.length === 0 && (
          <div className='p-4 text-center'>
            <p className='font-medium text-sm'>No bots found</p>
            <p className='text-muted-foreground text-xs'>
              No bots available for this Vyin application.
            </p>
          </div>
        )}

        {bots.length > 0 && (
          <>
            {bots.map((bot) => (
              <SelectItem key={bot.bot_id} value={bot.bot_id} className='cursor-pointer'>
                <div className='flex max-w-full items-center gap-2 overflow-hidden'>
                  <span className='truncate font-normal'>{bot.bot_nickname}</span>
                </div>
              </SelectItem>
            ))}
            {loading && pageToken && (
              <div className='flex items-center justify-center p-2'>
                <RefreshCw className='h-4 w-4 animate-spin text-muted-foreground' />
                <span className='ml-2 text-xs text-muted-foreground'>Loading more...</span>
              </div>
            )}
          </>
        )}
      </SelectContent>
    </Select>
  )
}
