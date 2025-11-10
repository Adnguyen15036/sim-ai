import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus, Trash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDisplayText } from '@/components/ui/formatted-text'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { checkTagTrigger, TagDropdown } from '@/components/ui/tag-dropdown'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useSubBlockValue } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/hooks/use-sub-block-value'
import { useAccessibleReferencePrefixes } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-accessible-reference-prefixes'

// ============================================================================
// Types & Constants
// ============================================================================

enum ResponseType {
  CARD = 'Card',
  BUTTON = 'Button',
}

enum FieldActionType {
  MESSAGE = 'message',
  HYPERLINK = 'hyperlink',
}

enum FormattedKey {
  BUTTONS_SUGGESTION = 'buttons_suggestion',
  CARDS_SUGGESTION = 'cards_suggestion',
}

const RESPONSE_TYPE_TO_KEY_MAP: Record<ResponseType, FormattedKey> = {
  [ResponseType.BUTTON]: FormattedKey.BUTTONS_SUGGESTION,
  [ResponseType.CARD]: FormattedKey.CARDS_SUGGESTION,
}

const KEY_TO_RESPONSE_TYPE_MAP: Record<FormattedKey, ResponseType> = {
  [FormattedKey.BUTTONS_SUGGESTION]: ResponseType.BUTTON,
  [FormattedKey.CARDS_SUGGESTION]: ResponseType.CARD,
}

interface Field {
  id: string
  value?: {
    content?: string
    message?: string
    type?: FieldActionType
    link?: string
  }
  collapsed?: boolean
}

interface VyinResponseValue {
  type: ResponseType
  fields: Field[]
}

interface VyinResponseFormatProps {
  blockId: string
  subBlockId: string
  isPreview?: boolean
  previewValue?: VyinResponseValue | null
  disabled?: boolean
  isConnecting?: boolean
  config?: any
}

const DEFAULT_FIELD: Field = {
  id: crypto.randomUUID(),
  value: {
    content: '',
    type: undefined,
    link: '',
    message: '',
  },
  collapsed: false,
}

// ============================================================================
// Extracted Components
// ============================================================================

interface TaggedInputProps {
  fieldId: string
  value: string
  placeholder: string
  disabled: boolean
  dragHighlight: boolean
  isConnecting: boolean
  config: any
  accessiblePrefixes: any
  showTags: boolean
  cursorPosition: number
  blockId: string
  activeSourceBlockId: string | null
  onValueChange: (value: string, caretPosition?: number) => void
  onBlur: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onScroll: (e: React.UIEvent<HTMLInputElement>) => void
  onPaste: () => void
  onTagSelect: (newValue: string) => void
  onTagClose: () => void
  inputRef: (el: HTMLInputElement | null) => void
  overlayRef: (el: HTMLDivElement | null) => void
}

function TaggedInput({
  fieldId,
  value,
  placeholder,
  disabled,
  dragHighlight,
  isConnecting,
  config,
  accessiblePrefixes,
  showTags,
  cursorPosition,
  blockId,
  activeSourceBlockId,
  onValueChange,
  onBlur,
  onDragOver,
  onDragLeave,
  onDrop,
  onScroll,
  onPaste,
  onTagSelect,
  onTagClose,
  inputRef,
  overlayRef,
}: TaggedInputProps) {
  return (
    <div className='relative'>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onValueChange(e.target.value, e.target.selectionStart ?? undefined)}
        onBlur={onBlur}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onScroll={onScroll}
        onPaste={onPaste}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'allow-scroll h-9 w-full overflow-auto border border-input bg-white text-transparent caret-foreground placeholder:text-muted-foreground/50 dark:border-input/60 dark:bg-background',
          dragHighlight && 'ring-2 ring-blue-500 ring-offset-2',
          isConnecting &&
            config?.connectionDroppable !== false &&
            'ring-2 ring-blue-500 ring-offset-2 focus-visible:ring-blue-500'
        )}
        style={{ overflowX: 'auto' }}
      />
      <div
        ref={overlayRef}
        className='pointer-events-none absolute inset-0 flex items-center overflow-x-auto bg-transparent px-3 text-sm'
        style={{ overflowX: 'auto' }}
      >
        <div
          className='w-full whitespace-pre'
          style={{ scrollbarWidth: 'none', minWidth: 'fit-content' }}
        >
          {formatDisplayText(
            value,
            accessiblePrefixes ? { accessiblePrefixes } : { highlightAll: true }
          )}
        </div>
      </div>
      <TagDropdown
        visible={showTags}
        onSelect={onTagSelect}
        blockId={blockId}
        activeSourceBlockId={activeSourceBlockId}
        inputValue={value}
        cursorPosition={cursorPosition}
        onClose={onTagClose}
      />
    </div>
  )
}

interface TaggedTextareaProps {
  fieldId: string
  value: string
  placeholder: string
  disabled: boolean
  dragHighlight: boolean
  isConnecting: boolean
  config: any
  accessiblePrefixes: any
  showTags: boolean
  cursorPosition: number
  blockId: string
  activeSourceBlockId: string | null
  onValueChange: (value: string, caretPosition?: number) => void
  onBlur: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onTagSelect: (newValue: string) => void
  onTagClose: () => void
  inputRef: (el: HTMLTextAreaElement | null) => void
  overlayRef: (el: HTMLDivElement | null) => void
}

function TaggedTextarea({
  fieldId,
  value,
  placeholder,
  disabled,
  dragHighlight,
  isConnecting,
  config,
  accessiblePrefixes,
  showTags,
  cursorPosition,
  blockId,
  activeSourceBlockId,
  onValueChange,
  onBlur,
  onDragOver,
  onDragLeave,
  onDrop,
  onTagSelect,
  onTagClose,
  inputRef,
  overlayRef,
}: TaggedTextareaProps) {
  return (
    <div className='relative'>
      <Textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onValueChange(e.target.value, e.target.selectionStart ?? undefined)}
        onBlur={onBlur}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'min-h-[80px] resize-none border border-input bg-white text-transparent caret-foreground placeholder:text-muted-foreground/50 dark:border-input/60 dark:bg-background',
          dragHighlight && 'ring-2 ring-blue-500 ring-offset-2',
          isConnecting &&
            config?.connectionDroppable !== false &&
            'ring-2 ring-blue-500 ring-offset-2 focus-visible:ring-blue-500'
        )}
      />
      <div
        ref={overlayRef}
        className='pointer-events-none absolute inset-0 overflow-auto bg-transparent px-3 py-2 text-sm'
      >
        <div className='whitespace-pre-wrap break-words'>
          {formatDisplayText(
            value,
            accessiblePrefixes ? { accessiblePrefixes } : { highlightAll: true }
          )}
        </div>
      </div>
      <TagDropdown
        visible={showTags}
        onSelect={onTagSelect}
        blockId={blockId}
        activeSourceBlockId={activeSourceBlockId}
        inputValue={value}
        cursorPosition={cursorPosition}
        onClose={onTagClose}
      />
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function VyinResponseFormat({
  blockId,
  subBlockId,
  isPreview = false,
  previewValue,
  disabled = false,
  isConnecting = false,
  config,
}: VyinResponseFormatProps) {
  // ========================================
  // State & Refs
  // ========================================

  const [storeValue, setStoreValueRaw] = useSubBlockValue<VyinResponseValue | null>(
    blockId,
    subBlockId
  )

  const hasFormattedRef = useRef(false)
  const fieldIdMapRef = useRef<Map<string, string>>(new Map())
  const valueInputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement>>({})
  const overlayRefs = useRef<Record<string, HTMLDivElement>>({})

  // UI State
  const [collapsedState, setCollapsedState] = useState<Record<string, boolean>>({})
  const [localValues, setLocalValues] = useState<Record<string, string>>({})
  const [showTags, setShowTags] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [activeSourceBlockId, setActiveSourceBlockId] = useState<string | null>(null)
  const [dragHighlight, setDragHighlight] = useState<Record<string, boolean>>({})

  const accessiblePrefixes = useAccessibleReferencePrefixes(blockId)

  // ========================================
  // Value Formatting & Parsing
  // ========================================

  const formatResponseMetaarray = useCallback(
    (
      obj: VyinResponseValue
    ): Array<{
      key: string
      value: Array<Record<string, any>>
    }> => {
      if (!obj || !obj.type || !obj.fields) {
        return []
      }

      // Store field IDs by type and index for stable ID mapping
      obj.fields.forEach((field, index) => {
        const mapKey = `${obj.type}_${index}`
        fieldIdMapRef.current.set(mapKey, field.id)
      })

      const formattedKey = RESPONSE_TYPE_TO_KEY_MAP[obj.type]

      return [
        {
          key: formattedKey,
          value: obj.fields.map((field) => field.value ?? {}),
        },
      ]
    },
    []
  )

  const isFormattedValue = useCallback((val: any): boolean => {
    return Array.isArray(val) && val.length > 0 && val[0]?.key !== undefined
  }, [])

  const parseFormattedValue = useCallback((formatted: any[]): VyinResponseValue | null => {
    if (!formatted || formatted.length === 0) return null
    const item = formatted[0]
    if (!item?.key || !Array.isArray(item.value)) return null

    const type = KEY_TO_RESPONSE_TYPE_MAP[item.key as FormattedKey] ?? ResponseType.CARD

    return {
      type,
      fields: item.value.map((val: Record<string, any>, index: number) => {
        const mapKey = `${type}_${index}`
        const existingId = fieldIdMapRef.current.get(mapKey)
        const fieldId = existingId ?? crypto.randomUUID()

        if (!existingId) {
          fieldIdMapRef.current.set(mapKey, fieldId)
        }

        return {
          id: fieldId,
          value: val,
          collapsed: false,
        }
      }),
    }
  }, [])

  const value = useMemo(() => {
    const rawValue = isPreview ? previewValue : storeValue
    if (!rawValue) return null
    if (isFormattedValue(rawValue)) {
      return parseFormattedValue(rawValue as unknown as any[])
    }
    if (typeof rawValue === 'object' && 'type' in rawValue && 'fields' in rawValue) {
      return rawValue as VyinResponseValue
    }
    return null
  }, [isPreview, previewValue, storeValue, isFormattedValue, parseFormattedValue])

  const setStoreValue = useCallback(
    (newValue: VyinResponseValue | null) => {
      if (isPreview || disabled) return
      if (!newValue || !newValue.type || !newValue.fields) {
        setStoreValueRaw(null)
        return
      }
      const formatted = formatResponseMetaarray(newValue)
      if (formatted && formatted.length > 0) {
        setStoreValueRaw(formatted as any)
        hasFormattedRef.current = true
      }
    },
    [isPreview, disabled, setStoreValueRaw, formatResponseMetaarray]
  )

  const selectedType = value?.type
  const fields: Field[] = value?.fields || []

  // ========================================
  // Effects
  // ========================================

  // Initialize local values from fields
  useEffect(() => {
    const initial: Record<string, string> = {}
    fields.forEach((f) => {
      if (localValues[`${f.id}_message`] === undefined) {
        initial[`${f.id}_message`] = f.value?.message || ''
      }
      if (localValues[`${f.id}_content`] === undefined && f.value?.content !== undefined) {
        initial[`${f.id}_content`] = f.value?.content || ''
      }
      if (localValues[`${f.id}_link`] === undefined && f.value?.link !== undefined) {
        initial[`${f.id}_link`] = f.value?.link || ''
      }
    })
    if (Object.keys(initial).length > 0) {
      setLocalValues((prev) => ({ ...prev, ...initial }))
    }
  }, [fields])

  // Auto-format unformatted values
  useEffect(() => {
    if (isPreview || disabled || !storeValue || hasFormattedRef.current) return

    if (
      typeof storeValue === 'object' &&
      'type' in storeValue &&
      'fields' in storeValue &&
      !isFormattedValue(storeValue)
    ) {
      const formatted = formatResponseMetaarray(storeValue as VyinResponseValue)
      setStoreValueRaw(formatted as any)
      hasFormattedRef.current = true
    } else if (isFormattedValue(storeValue)) {
      hasFormattedRef.current = true
    }
  }, [storeValue, isPreview, disabled, formatResponseMetaarray, isFormattedValue, setStoreValueRaw])

  // ========================================
  // Field Operations
  // ========================================

  const addField = useCallback(() => {
    if (isPreview || disabled || !selectedType) return

    const newField: Field = {
      ...DEFAULT_FIELD,
      id: crypto.randomUUID(),
    }
    setStoreValue({
      type: selectedType,
      fields: [...fields, newField],
    })
  }, [isPreview, disabled, selectedType, fields, setStoreValue])

  const removeField = useCallback(
    (id: string) => {
      if (isPreview || disabled || !selectedType) return
      setStoreValue({
        type: selectedType,
        fields: fields.filter((field: Field) => field.id !== id),
      })
    },
    [isPreview, disabled, selectedType, fields, setStoreValue]
  )

  const updateValueField = useCallback(
    (id: string, field: 'content' | 'message' | 'type' | 'link', fieldValue: any) => {
      if (isPreview || disabled || !selectedType) return

      setStoreValue({
        type: selectedType,
        fields: fields.map((f: Field) => {
          if (f.id === id) {
            return {
              ...f,
              value: {
                ...(f.value || {}),
                [field]: fieldValue,
              },
            }
          }
          return f
        }),
      })
    },
    [isPreview, disabled, selectedType, fields, setStoreValue]
  )

  const updateMultipleValueFields = useCallback(
    (
      id: string,
      updates: Partial<{
        content: string
        message: string
        type: FieldActionType
        link: string
      }>
    ) => {
      if (isPreview || disabled || !selectedType) return

      setStoreValue({
        type: selectedType,
        fields: fields.map((f: Field) => {
          if (f.id === id) {
            return {
              ...f,
              value: {
                ...(f.value || {}),
                ...updates,
              },
            }
          }
          return f
        }),
      })
    },
    [isPreview, disabled, selectedType, fields, setStoreValue]
  )

  const toggleCollapse = useCallback(
    (id: string) => {
      if (isPreview || disabled) return

      setCollapsedState((prev) => ({
        ...prev,
        [id]: !prev[id],
      }))
    },
    [isPreview, disabled]
  )

  const handleTypeChange = useCallback(
    (newType: ResponseType) => {
      if (isPreview || disabled) return
      setStoreValue({
        type: newType,
        fields: [],
      })
    },
    [isPreview, disabled, setStoreValue]
  )

  // ========================================
  // Tag Input Handlers
  // ========================================

  const createFieldId = (fieldId: string, fieldName: string) => `${fieldId}_${fieldName}`

  const handleValueInputChange = useCallback(
    (
      fieldId: string,
      field: 'content' | 'message' | 'link',
      newValue: string,
      caretPosition?: number
    ) => {
      setLocalValues((prev) => ({ ...prev, [fieldId]: newValue }))

      const position = typeof caretPosition === 'number' ? caretPosition : newValue.length
      setCursorPosition(position)
      setActiveFieldId(fieldId)
      const trigger = checkTagTrigger(newValue, position)
      setShowTags(trigger.show)
    },
    []
  )

  const handleValueInputBlur = useCallback(
    (field: Field, fieldName: 'content' | 'message' | 'link') => {
      if (isPreview || disabled) return

      const compositeId = createFieldId(field.id, fieldName)
      const inputEl = valueInputRefs.current[compositeId]
      if (!inputEl) return

      const current = localValues[compositeId] ?? inputEl.value ?? ''
      updateValueField(field.id, fieldName, current)
    },
    [isPreview, disabled, localValues, updateValueField]
  )

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent, fieldId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragHighlight((prev) => ({ ...prev, [fieldId]: true }))
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent, fieldId: string) => {
    e.preventDefault()
    setDragHighlight((prev) => ({ ...prev, [fieldId]: false }))
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, fieldId: string, fieldName: 'content' | 'message' | 'link') => {
      e.preventDefault()
      setDragHighlight((prev) => ({ ...prev, [fieldId]: false }))
      const input = valueInputRefs.current[fieldId]
      input?.focus()

      if (input) {
        const currentValue = localValues[fieldId] ?? ''
        const dropPosition = (input as any).selectionStart ?? currentValue.length
        const newValue = `${currentValue.slice(
          0,
          dropPosition
        )}<${currentValue.slice(dropPosition)}`
        setLocalValues((prev) => ({ ...prev, [fieldId]: newValue }))
        setActiveFieldId(fieldId)
        setCursorPosition(dropPosition + 1)
        setShowTags(true)

        try {
          const data = JSON.parse(e.dataTransfer.getData('application/json'))
          if (data?.connectionData?.sourceBlockId) {
            setActiveSourceBlockId(data.connectionData.sourceBlockId)
          }
        } catch {}

        setTimeout(() => {
          const el = valueInputRefs.current[fieldId]
          if (el && typeof (el as any).selectionStart === 'number') {
            ;(el as any).selectionStart = dropPosition + 1
            ;(el as any).selectionEnd = dropPosition + 1
          }
        }, 0)
      }
    },
    [localValues]
  )

  const handleValueScroll = useCallback((fieldId: string, e: React.UIEvent<HTMLInputElement>) => {
    const overlay = overlayRefs.current[fieldId]
    if (overlay) {
      overlay.scrollLeft = e.currentTarget.scrollLeft
    }
  }, [])

  const handleValuePaste = useCallback((fieldId: string) => {
    setTimeout(() => {
      const input = valueInputRefs.current[fieldId] as HTMLInputElement | undefined
      const overlay = overlayRefs.current[fieldId]
      if (input && overlay) overlay.scrollLeft = input.scrollLeft
    }, 0)
  }, [])

  // ========================================
  // Render Helpers
  // ========================================

  const renderFieldHeader = useCallback(
    (field: Field, index: number) => {
      const label = selectedType === ResponseType.CARD ? ResponseType.CARD : ResponseType.BUTTON
      const isCollapsed = collapsedState[field.id] || false

      return (
        <div
          className='flex h-9 cursor-pointer items-center justify-between px-3 py-1 hover:bg-muted/50 transition-colors'
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            toggleCollapse(field.id)
          }}
        >
          <div className='flex items-center gap-2'>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                isCollapsed && 'rotate-[-90deg]'
              )}
            />
            <span className='text-sm text-foreground'>
              {label} {index + 1}
            </span>
          </div>
          <div className='flex items-center gap-1' onClick={(e) => e.stopPropagation()}>
            <Button
              variant='ghost'
              size='icon'
              onClick={addField}
              disabled={isPreview || disabled}
              className='h-6 w-6 rounded-full'
            >
              <Plus className='h-3.5 w-3.5' />
              <span className='sr-only'>Add Field</span>
            </Button>

            <Button
              variant='ghost'
              size='icon'
              onClick={() => removeField(field.id)}
              disabled={isPreview || disabled}
              className='h-6 w-6 rounded-full text-destructive hover:text-destructive'
            >
              <Trash className='h-3.5 w-3.5' />
              <span className='sr-only'>Delete Field</span>
            </Button>
          </div>
        </div>
      )
    },
    [selectedType, collapsedState, toggleCollapse, addField, removeField, isPreview, disabled]
  )

  // ========================================
  // Render
  // ========================================

  return (
    <div className='space-y-2'>
      <div className='space-y-1.5'>
        <Select
          value={selectedType || undefined}
          onValueChange={(v) => {
            if (v === ResponseType.CARD || v === ResponseType.BUTTON) {
              handleTypeChange(v as ResponseType)
            }
          }}
          disabled={isPreview || disabled}
        >
          <SelectTrigger className='h-9 w-full justify-between font-normal'>
            <SelectValue
              placeholder={<span className='text-muted-foreground/50'>Select type</span>}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ResponseType.BUTTON}>{ResponseType.BUTTON}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedType && (
        <>
          {fields.length === 0 ? (
            <div className='flex flex-col items-center justify-center rounded-md border border-input/50 border-dashed py-8'>
              <p className='mb-3 text-muted-foreground text-sm'>
                No {selectedType.toLowerCase()} defined
              </p>
              <Button
                variant='outline'
                size='sm'
                onClick={addField}
                disabled={isPreview || disabled}
                className='h-8'
              >
                <Plus className='mr-1.5 h-3.5 w-3.5' />
                Add {selectedType}
              </Button>
            </div>
          ) : (
            fields.map((field, index) => {
              const isCollapsed = collapsedState[field.id] || false
              const messageFieldId = createFieldId(field.id, 'message')
              const linkFieldId = createFieldId(field.id, 'link')
              const contentFieldId = createFieldId(field.id, 'content')

              return (
                <div
                  key={field.id}
                  data-field-id={field.id}
                  className={cn(
                    'rounded-md border shadow-sm border-input',
                    isCollapsed ? 'overflow-hidden' : 'overflow-visible'
                  )}
                >
                  {renderFieldHeader(field, index)}

                  {!isCollapsed && (
                    <div className='space-y-2 border-t px-3 pt-1.5 pb-2'>
                      {/* Button Text Field */}
                      <div className='space-y-1.5'>
                        <Label className='text-xs'>Button Text</Label>
                        <TaggedInput
                          fieldId={messageFieldId}
                          value={localValues[messageFieldId] ?? field.value?.message ?? ''}
                          placeholder='Enter button text'
                          disabled={isPreview || disabled}
                          dragHighlight={dragHighlight[messageFieldId] || false}
                          isConnecting={isConnecting}
                          config={config}
                          accessiblePrefixes={accessiblePrefixes}
                          showTags={showTags && activeFieldId === messageFieldId}
                          cursorPosition={cursorPosition}
                          blockId={blockId}
                          activeSourceBlockId={activeSourceBlockId}
                          onValueChange={(value, caretPosition) =>
                            handleValueInputChange(messageFieldId, 'message', value, caretPosition)
                          }
                          onBlur={() => handleValueInputBlur(field, 'message')}
                          onDragOver={(e) => handleDragOver(e, messageFieldId)}
                          onDragLeave={(e) => handleDragLeave(e, messageFieldId)}
                          onDrop={(e) => handleDrop(e, messageFieldId, 'message')}
                          onScroll={(e) => handleValueScroll(messageFieldId, e)}
                          onPaste={() => handleValuePaste(messageFieldId)}
                          onTagSelect={(newValue) => {
                            setLocalValues((prev) => ({
                              ...prev,
                              [messageFieldId]: newValue,
                            }))
                            if (!isPreview && !disabled)
                              updateValueField(field.id, 'message', newValue)
                            setShowTags(false)
                            setActiveSourceBlockId(null)
                          }}
                          onTagClose={() => setShowTags(false)}
                          inputRef={(el) => {
                            if (el) valueInputRefs.current[messageFieldId] = el
                          }}
                          overlayRef={(el) => {
                            if (el) overlayRefs.current[messageFieldId] = el
                          }}
                        />
                      </div>

                      {/* Type Selector */}
                      <div className='space-y-1.5'>
                        <Label className='text-xs'>Type</Label>
                        <Select
                          value={field.value?.type || undefined}
                          onValueChange={(v) => {
                            if (v === FieldActionType.HYPERLINK) {
                              updateMultipleValueFields(field.id, {
                                type: FieldActionType.HYPERLINK,
                                content: '',
                              })
                            } else if (v === FieldActionType.MESSAGE) {
                              updateMultipleValueFields(field.id, {
                                type: FieldActionType.MESSAGE,
                                link: '',
                              })
                            }
                          }}
                          disabled={isPreview || disabled}
                        >
                          <SelectTrigger className='h-9 w-full justify-between font-normal'>
                            <SelectValue placeholder='Select type' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={FieldActionType.HYPERLINK}>Link</SelectItem>
                            <SelectItem value={FieldActionType.MESSAGE}>Message</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Link Field (conditional) */}
                      {field.value?.type === FieldActionType.HYPERLINK && (
                        <div className='space-y-1.5'>
                          <Label className='text-xs'>Link</Label>
                          <TaggedInput
                            fieldId={linkFieldId}
                            value={localValues[linkFieldId] ?? field.value?.link ?? ''}
                            placeholder='Enter link URL'
                            disabled={isPreview || disabled}
                            dragHighlight={dragHighlight[linkFieldId] || false}
                            isConnecting={isConnecting}
                            config={config}
                            accessiblePrefixes={accessiblePrefixes}
                            showTags={showTags && activeFieldId === linkFieldId}
                            cursorPosition={cursorPosition}
                            blockId={blockId}
                            activeSourceBlockId={activeSourceBlockId}
                            onValueChange={(value, caretPosition) =>
                              handleValueInputChange(linkFieldId, 'link', value, caretPosition)
                            }
                            onBlur={() => handleValueInputBlur(field, 'link')}
                            onDragOver={(e) => handleDragOver(e, linkFieldId)}
                            onDragLeave={(e) => handleDragLeave(e, linkFieldId)}
                            onDrop={(e) => handleDrop(e, linkFieldId, 'link')}
                            onScroll={(e) => handleValueScroll(linkFieldId, e)}
                            onPaste={() => handleValuePaste(linkFieldId)}
                            onTagSelect={(newValue) => {
                              setLocalValues((prev) => ({
                                ...prev,
                                [linkFieldId]: newValue,
                              }))
                              if (!isPreview && !disabled)
                                updateValueField(field.id, 'link', newValue)
                              setShowTags(false)
                              setActiveSourceBlockId(null)
                            }}
                            onTagClose={() => setShowTags(false)}
                            inputRef={(el) => {
                              if (el) valueInputRefs.current[linkFieldId] = el
                            }}
                            overlayRef={(el) => {
                              if (el) overlayRefs.current[linkFieldId] = el
                            }}
                          />
                        </div>
                      )}

                      {/* Content Field (conditional) */}
                      {field.value?.type === FieldActionType.MESSAGE && (
                        <div className='space-y-1.5'>
                          <Label className='text-xs'>Content</Label>
                          <TaggedTextarea
                            fieldId={contentFieldId}
                            value={localValues[contentFieldId] ?? field.value?.content ?? ''}
                            placeholder='Enter content'
                            disabled={isPreview || disabled}
                            dragHighlight={dragHighlight[contentFieldId] || false}
                            isConnecting={isConnecting}
                            config={config}
                            accessiblePrefixes={accessiblePrefixes}
                            showTags={showTags && activeFieldId === contentFieldId}
                            cursorPosition={cursorPosition}
                            blockId={blockId}
                            activeSourceBlockId={activeSourceBlockId}
                            onValueChange={(value, caretPosition) =>
                              handleValueInputChange(
                                contentFieldId,
                                'content',
                                value,
                                caretPosition
                              )
                            }
                            onBlur={() => handleValueInputBlur(field, 'content')}
                            onDragOver={(e) =>
                              handleDragOver(e as unknown as React.DragEvent, contentFieldId)
                            }
                            onDragLeave={(e) =>
                              handleDragLeave(e as unknown as React.DragEvent, contentFieldId)
                            }
                            onDrop={(e) =>
                              handleDrop(e as unknown as React.DragEvent, contentFieldId, 'content')
                            }
                            onTagSelect={(newValue) => {
                              setLocalValues((prev) => ({
                                ...prev,
                                [contentFieldId]: newValue,
                              }))
                              if (!isPreview && !disabled)
                                updateValueField(field.id, 'content', newValue)
                              setShowTags(false)
                              setActiveSourceBlockId(null)
                            }}
                            onTagClose={() => setShowTags(false)}
                            inputRef={(el) => {
                              if (el) valueInputRefs.current[contentFieldId] = el
                            }}
                            overlayRef={(el) => {
                              if (el) overlayRefs.current[contentFieldId] = el
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )
}

export type { Field as VyinResponseField, VyinResponseValue }
export { ResponseType, FieldActionType, FormattedKey }
