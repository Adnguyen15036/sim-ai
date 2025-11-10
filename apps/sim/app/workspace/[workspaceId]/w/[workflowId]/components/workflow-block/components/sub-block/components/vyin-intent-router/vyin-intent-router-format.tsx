import { useEffect, useRef, useState } from 'react'
import { Plus, Trash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDisplayText } from '@/components/ui/formatted-text'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkTagTrigger, TagDropdown } from '@/components/ui/tag-dropdown'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-sub-block-value'
import { useAccessibleReferencePrefixes } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-accessible-reference-prefixes'

interface IntentRoute {
  id: string
  keywords: string
  routeTo: string
  collapsed?: boolean
}

interface IntentRouterFormatProps {
  blockId: string
  subBlockId: string
  isPreview?: boolean
  previewValue?: IntentRoute[] | null
  disabled?: boolean
  isConnecting?: boolean
  config?: any
}

const DEFAULT_ROUTE: IntentRoute = {
  id: crypto.randomUUID(),
  keywords: '',
  routeTo: '',
  collapsed: false,
}

export function VyinIntentRouterFormat({
  blockId,
  subBlockId,
  isPreview = false,
  previewValue,
  disabled = false,
  isConnecting = false,
  config,
}: IntentRouterFormatProps) {
  const [storeValue, setStoreValue] = useSubBlockValue<IntentRoute[]>(blockId, subBlockId)
  const [dragHighlight, setDragHighlight] = useState<Record<string, boolean>>({})
  const keywordsInputRefs = useRef<Record<string, HTMLTextAreaElement>>({})
  const routeToInputRefs = useRef<Record<string, HTMLInputElement>>({})
  const routeToOverlayRefs = useRef<Record<string, HTMLDivElement>>({})
  const [localKeywords, setLocalKeywords] = useState<Record<string, string>>({})
  const [localRouteTo, setLocalRouteTo] = useState<Record<string, string>>({})
  const [showTags, setShowTags] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [activeSourceBlockId, setActiveSourceBlockId] = useState<string | null>(null)
  const accessiblePrefixes = useAccessibleReferencePrefixes(blockId)

  const value = isPreview ? previewValue : storeValue
  const routes: IntentRoute[] = Array.isArray(value) ? value : []

  useEffect(() => {
    const initialKeywords: Record<string, string> = {}
    const initialRouteTo: Record<string, string> = {}
    ;(routes || []).forEach((r) => {
      if (localKeywords[r.id] === undefined) {
        initialKeywords[r.id] = r.keywords || ''
      }
      if (localRouteTo[r.id] === undefined) {
        initialRouteTo[r.id] = r.routeTo || ''
      }
    })
    if (Object.keys(initialKeywords).length > 0) {
      setLocalKeywords((prev) => ({ ...prev, ...initialKeywords }))
    }
    if (Object.keys(initialRouteTo).length > 0) {
      setLocalRouteTo((prev) => ({ ...prev, ...initialRouteTo }))
    }
  }, [routes])

  // Route operations
  const addRoute = () => {
    if (isPreview || disabled) return

    const newRoute: IntentRoute = {
      ...DEFAULT_ROUTE,
      id: crypto.randomUUID(),
    }
    setStoreValue([...(routes || []), newRoute])
  }

  const removeRoute = (id: string) => {
    if (isPreview || disabled) return
    setStoreValue((routes || []).filter((route: IntentRoute) => route.id !== id))
  }

  const handleRouteToInputChange = (routeId: string, newValue: string, caretPosition?: number) => {
    setLocalRouteTo((prev) => ({ ...prev, [routeId]: newValue }))

    const position = typeof caretPosition === 'number' ? caretPosition : newValue.length
    setCursorPosition(position)
    setActiveFieldId(routeId)
    const trigger = checkTagTrigger(newValue, position)
    setShowTags(trigger.show)
  }

  const handleRouteToInputBlur = (route: IntentRoute) => {
    if (isPreview || disabled) return

    const inputEl = routeToInputRefs.current[route.id]
    if (!inputEl) return

    const current = localRouteTo[route.id] ?? inputEl.value ?? ''
    updateRoute(route.id, 'routeTo', current)
  }

  const handleKeywordsInputBlur = (route: IntentRoute) => {
    if (isPreview || disabled) return

    const inputEl = keywordsInputRefs.current[route.id]
    if (!inputEl) return

    const current = localKeywords[route.id] ?? inputEl.value ?? ''
    updateRoute(route.id, 'keywords', current)
  }

  // Drag and drop handlers for Route To field
  const handleDragOver = (e: React.DragEvent, routeId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragHighlight((prev) => ({ ...prev, [routeId]: true }))
  }

  const handleDragLeave = (e: React.DragEvent, routeId: string) => {
    e.preventDefault()
    setDragHighlight((prev) => ({ ...prev, [routeId]: false }))
  }

  const handleDrop = (e: React.DragEvent, routeId: string) => {
    e.preventDefault()
    setDragHighlight((prev) => ({ ...prev, [routeId]: false }))
    const input = routeToInputRefs.current[routeId]
    input?.focus()

    if (input) {
      const currentValue =
        localRouteTo[routeId] ?? (routes.find((r) => r.id === routeId)?.routeTo || '')
      const dropPosition = (input as any).selectionStart ?? currentValue.length
      const newValue = `${currentValue.slice(0, dropPosition)}<${currentValue.slice(dropPosition)}`
      setLocalRouteTo((prev) => ({ ...prev, [routeId]: newValue }))
      setActiveFieldId(routeId)
      setCursorPosition(dropPosition + 1)
      setShowTags(true)

      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'))
        if (data?.connectionData?.sourceBlockId) {
          setActiveSourceBlockId(data.connectionData.sourceBlockId)
        }
      } catch {}

      setTimeout(() => {
        const el = routeToInputRefs.current[routeId]
        if (el && typeof (el as any).selectionStart === 'number') {
          ;(el as any).selectionStart = dropPosition + 1
          ;(el as any).selectionEnd = dropPosition + 1
        }
      }, 0)
    }
  }

  const handleRouteToScroll = (routeId: string, e: React.UIEvent<HTMLInputElement>) => {
    const overlay = routeToOverlayRefs.current[routeId]
    if (overlay) {
      overlay.scrollLeft = e.currentTarget.scrollLeft
    }
  }

  const handleRouteToPaste = (routeId: string) => {
    setTimeout(() => {
      const input = routeToInputRefs.current[routeId] as HTMLInputElement | undefined
      const overlay = routeToOverlayRefs.current[routeId]
      if (input && overlay) overlay.scrollLeft = input.scrollLeft
    }, 0)
  }

  // Update handlers
  const updateRoute = (id: string, field: keyof IntentRoute, value: any) => {
    if (isPreview || disabled) return

    setStoreValue(
      (routes || []).map((r: IntentRoute) => (r.id === id ? { ...r, [field]: value } : r))
    )
  }

  const toggleCollapse = (id: string) => {
    if (isPreview || disabled) return
    setStoreValue(
      (routes || []).map((r: IntentRoute) => (r.id === id ? { ...r, collapsed: !r.collapsed } : r))
    )
  }

  // Route header
  const renderRouteHeader = (route: IntentRoute, index: number) => {
    const isUnconfigured = !route.keywords || route.keywords.trim() === ''

    return (
      <div
        className='flex h-9 cursor-pointer items-center justify-between px-3 py-1'
        onClick={() => toggleCollapse(route.id)}
      >
        <div className='flex items-center'>
          <span
            className={cn(
              'text-sm',
              isUnconfigured ? 'text-muted-foreground/50' : 'text-foreground'
            )}
          >
            {`Route ${index + 1}`}
          </span>
        </div>
        <div className='flex items-center gap-1' onClick={(e) => e.stopPropagation()}>
          <Button
            variant='ghost'
            size='icon'
            onClick={addRoute}
            disabled={isPreview || disabled}
            className='h-6 w-6 rounded-full'
          >
            <Plus className='h-3.5 w-3.5' />
            <span className='sr-only'>Add Route</span>
          </Button>

          <Button
            variant='ghost'
            size='icon'
            onClick={() => removeRoute(route.id)}
            disabled={isPreview || disabled}
            className='h-6 w-6 rounded-full text-destructive hover:text-destructive'
          >
            <Trash className='h-3.5 w-3.5' />
            <span className='sr-only'>Delete Route</span>
          </Button>
        </div>
      </div>
    )
  }

  // Main render
  return (
    <div className='space-y-2'>
      {routes.length === 0 ? (
        <div className='flex flex-col items-center justify-center rounded-md border border-input/50 border-dashed py-8'>
          <p className='mb-3 text-muted-foreground text-sm'>No intent routes defined</p>
          <Button
            variant='outline'
            size='sm'
            onClick={addRoute}
            disabled={isPreview || disabled}
            className='h-8'
          >
            <Plus className='mr-1.5 h-3.5 w-3.5' />
            Add Route
          </Button>
        </div>
      ) : (
        routes.map((route, index) => {
          const isUnconfigured = !route.keywords || route.keywords.trim() === ''

          return (
            <div
              key={route.id}
              data-route-id={route.id}
              className={cn(
                'rounded-md border shadow-sm',
                isUnconfigured ? 'border-input/50' : 'border-input',
                route.collapsed ? 'overflow-hidden' : 'overflow-visible'
              )}
            >
              {renderRouteHeader(route, index)}

              {!route.collapsed && (
                <div className='space-y-2 border-t px-3 pt-1.5 pb-2'>
                  <div className='space-y-1.5'>
                    <Label className='text-xs'>
                      Keywords
                      <span className='ml-1 text-red-500'>*</span>
                    </Label>
                    <Textarea
                      ref={(el) => {
                        if (el) keywordsInputRefs.current[route.id] = el
                      }}
                      name='keywords'
                      value={localKeywords[route.id] ?? route.keywords ?? ''}
                      onChange={(e) =>
                        setLocalKeywords((prev) => ({ ...prev, [route.id]: e.target.value }))
                      }
                      onBlur={() => handleKeywordsInputBlur(route)}
                      placeholder='e.g., support, help, customer service'
                      disabled={isPreview || disabled}
                      required
                      className='min-h-[80px] border border-input bg-white placeholder:text-muted-foreground/50 dark:border-input/60 dark:bg-background'
                    />
                  </div>

                  <div className='space-y-1.5'>
                    <Label className='text-xs'>
                      Route To
                      <span className='ml-1 text-red-500'>*</span>
                    </Label>
                    <div className='relative'>
                      <Input
                        ref={(el) => {
                          if (el) routeToInputRefs.current[route.id] = el
                        }}
                        name='routeTo'
                        value={localRouteTo[route.id] ?? route.routeTo ?? ''}
                        onChange={(e) =>
                          handleRouteToInputChange(
                            route.id,
                            e.target.value,
                            e.target.selectionStart ?? undefined
                          )
                        }
                        onBlur={() => handleRouteToInputBlur(route)}
                        onDragOver={(e) => handleDragOver(e, route.id)}
                        onDragLeave={(e) => handleDragLeave(e, route.id)}
                        onDrop={(e) => handleDrop(e, route.id)}
                        onScroll={(e) => handleRouteToScroll(route.id, e)}
                        onPaste={() => handleRouteToPaste(route.id)}
                        placeholder='Block name or ID to route to'
                        disabled={isPreview || disabled}
                        required
                        className={cn(
                          'allow-scroll h-9 w-full overflow-auto border border-input bg-white text-transparent caret-foreground placeholder:text-muted-foreground/50 dark:border-input/60 dark:bg-background',
                          dragHighlight[route.id] && 'ring-2 ring-blue-500 ring-offset-2',
                          isConnecting &&
                            config?.connectionDroppable !== false &&
                            'ring-2 ring-blue-500 ring-offset-2 focus-visible:ring-blue-500'
                        )}
                        style={{ overflowX: 'auto' }}
                      />
                      <div
                        ref={(el) => {
                          if (el) routeToOverlayRefs.current[route.id] = el
                        }}
                        className='pointer-events-none absolute inset-0 flex items-center overflow-x-auto bg-transparent px-3 text-sm'
                        style={{ overflowX: 'auto' }}
                      >
                        <div
                          className='w-full whitespace-pre'
                          style={{ scrollbarWidth: 'none', minWidth: 'fit-content' }}
                        >
                          {formatDisplayText(
                            (localRouteTo[route.id] ?? route.routeTo ?? '')?.toString(),
                            accessiblePrefixes ? { accessiblePrefixes } : { highlightAll: true }
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Tag dropdown for route to field */}
                    <TagDropdown
                      visible={showTags && activeFieldId === route.id}
                      onSelect={(newValue) => {
                        setLocalRouteTo((prev) => ({ ...prev, [route.id]: newValue }))
                        if (!isPreview && !disabled) updateRoute(route.id, 'routeTo', newValue)
                        setShowTags(false)
                        setActiveSourceBlockId(null)
                      }}
                      blockId={blockId}
                      activeSourceBlockId={activeSourceBlockId}
                      inputValue={localRouteTo[route.id] ?? route.routeTo ?? ''}
                      cursorPosition={cursorPosition}
                      onClose={() => setShowTags(false)}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

export type { IntentRoute }
