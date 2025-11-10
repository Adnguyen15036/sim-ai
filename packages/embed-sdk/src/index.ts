type EmbedConfig = {
  containerId: string
  instanceUrl: string
  code: string
  workspaceId: string
  workflowId: string
  locale?: string
}

interface SetCookieConfig {
  code: string
  instanceUrl: string
  workspaceId: string
  workflowId: string
}

class GIMAutomationEmbed {
  private _isReady = false

  async embed({
    containerId,
    instanceUrl,
    code,
    workspaceId,
    workflowId,
    locale = 'en',
  }: EmbedConfig) {
    if (!containerId) throw new Error('GIMEmbed: containerId is required')
    if (!instanceUrl) throw new Error('GIMEmbed: instanceUrl is required')
    if (!code) throw new Error('GIMEmbed: code is required')
    if (!workspaceId) throw new Error('GIMEmbed: workspaceId is required')
    if (!workflowId) throw new Error('GIMEmbed: workflowId is required')

    const container = document.querySelector(`#${containerId}`)
    if (!container) throw new Error(`GIMEmbed: container with id '${containerId}' not found`)

    await this.setHeaderCookie({
      code,
      instanceUrl,
      workspaceId,
      workflowId,
    })

    const cleanInstanceUrl = instanceUrl.endsWith('/') ? instanceUrl.slice(0, -1) : instanceUrl

    const iframeUrl = `${cleanInstanceUrl}/workspace/${workspaceId}/w/${workflowId}`
    this._createIframe(container, iframeUrl)

    return { status: 'success' }
  }

  async setHeaderCookie({ code, instanceUrl }: SetCookieConfig) {
    const response = await fetch(
      `${instanceUrl}/api/internal/auth/embed-session/consume?code=${code}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    )

    if (!response.ok) {
      throw new Error(`GIMEmbed: Failed to start session (${response.status})`)
    }

    const setCookieHeader = response.headers.get('set-cookie')
    if (setCookieHeader) {
      document.cookie = setCookieHeader
        .split(';')
        .filter((part) => !part.trim().toLowerCase().startsWith('secure'))
        .join(';')
    }
  }

  private _createIframe(container: Element, src: string) {
    const iframe = document.createElement('iframe')
    iframe.src = src
    iframe.setAttribute('allow', 'clipboard-read; clipboard-write')
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups')
    iframe.style.width = '100%'
    iframe.style.height = '100%'
    iframe.style.border = 'none'

    iframe.onerror = () => {
      console.error('GIMEmbed: Failed to load iframe content.')
    }

    iframe.onload = () => {
      this._isReady = true
    }

    container.appendChild(iframe)
  }

  isReady(): boolean {
    return this._isReady
  }
}

const gimAutomationEmbed = new GIMAutomationEmbed()
;(window as any).gimAutomationEmbed = gimAutomationEmbed
;(window as any).GIMAutomationEmbed = GIMAutomationEmbed
