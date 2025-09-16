import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Gear, Robot, Lightning, Clock } from '@phosphor-icons/react'
import { useKV } from '@/hooks/useKV'
import { toast } from 'sonner'
import type { AgentConfig, ProviderSettings, LLMProvider } from '@/types/agent'
import { DEFAULT_PROVIDER_SETTINGS } from '@/types/agent'
import { AutonomousConfig, DEFAULT_AUTONOMOUS_CONFIG } from '@/types/autonomous'

interface OllamaModel { name?: string | null }
interface OllamaTagResponse { models?: OllamaModel[] }

interface OpenRouterModel { id?: string | null; name?: string | null }
interface OpenRouterResponse {
  data?: OpenRouterModel[]
  models?: OpenRouterModel[]
  error?: { message?: string | null } | string | null
}

const DEFAULT_AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'phys-alpha',
    name: 'Phys-Alpha',
    role: 'Initiator & Primary Derivator',
    provider: 'openai',
    model: 'gpt-4o',
    systemPrompt:
      'You are Phys-Alpha, a specialist in physics derivations. Your role is to initiate physics problems and establish foundational approaches. Focus on rigorous mathematical formulations and clear physical reasoning. Always provide COMPLETE derivations with ALL mathematical steps shown. Use LaTeX notation for equations (\\[ \\] for block equations, \\( \\) for inline). CRITICAL: Ensure your response is complete and thorough - do not stop mid-sentence, mid-equation, or mid-thought. Take your time to develop the complete mathematical framework.',
    temperature: 0.7,
    maxTokens: 8000,
    enabled: true
  },
  {
    id: 'phys-beta',
    name: 'Phys-Beta',
    role: 'Contributor & Extender',
    provider: 'openai',
    model: 'gpt-4o',
    systemPrompt:
      'You are Phys-Beta, a physics specialist who builds upon existing work. Your role is to extend and enhance derivations with additional insights, alternative approaches, and deeper analysis. Always provide COMPLETE mathematical derivations and thorough explanations. Use LaTeX notation for equations (\\[ \\] for block equations, \\( \\) for inline). CRITICAL: Ensure your response is complete and thorough - do not stop mid-sentence, mid-equation, or mid-thought. Continue writing until you have provided a complete and valuable contribution.',
    temperature: 0.8,
    maxTokens: 8000,
    enabled: true
  },
  {
    id: 'phys-gamma',
    name: 'Phys-Gamma',
    role: 'Oversight & Corrector',
    provider: 'openai',
    model: 'gpt-4o',
    systemPrompt:
      'You are Phys-Gamma, the oversight specialist. Your role is to review, correct, and ensure scientific rigor in physics derivations. Identify errors, suggest improvements, and make authoritative decisions about derivation quality. Provide COMPLETE analysis and corrections with full mathematical detail. Use LaTeX notation for equations (\\[ \\] for block equations, \\( \\) for inline). CRITICAL: Ensure your response is complete and thorough - do not stop mid-sentence, mid-equation, or mid-thought. Provide thorough review and complete recommendations.',
    temperature: 0.3,
    maxTokens: 8000,
    enabled: true
  }
]

const MODEL_SUGGESTIONS: Partial<Record<LLMProvider, string[]>> = {
  spark: ['gpt-4o', 'gpt-4o-mini'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
  openrouter: [
    'openrouter/auto',
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o-mini-2024-07-18',
    'google/gemini-flash-1.5',
    'mistralai/mistral-nemo'
  ],
  ollama: ['llama3.2', 'llama3.2:70b', 'phi3.5', 'mistral-nemo']
}

const VALID_PROVIDERS: LLMProvider[] = ['spark', 'openai', 'openrouter', 'ollama']

const cloneProviderDefaults = (): ProviderSettings =>
  JSON.parse(JSON.stringify(DEFAULT_PROVIDER_SETTINGS)) as ProviderSettings

const normalizeBaseUrl = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim()
  const base = trimmed && trimmed.length > 0 ? trimmed : fallback
  return base.replace(/\/+$/u, '')
}

interface AgentSettingsProps {
  onConfigChange?: (configs: AgentConfig[]) => void
  onAutonomousChange?: (config: AutonomousConfig) => void
}

export function AgentSettings({ onConfigChange, onAutonomousChange }: AgentSettingsProps) {
  const [agentConfigs, setAgentConfigs] = useKV<AgentConfig[]>('agent-configs', DEFAULT_AGENT_CONFIGS)
  const [providerConfigs, setProviderConfigs] = useKV<ProviderSettings>('provider-configs', cloneProviderDefaults())
  const [autonomousConfig, setAutonomousConfig] = useKV<AutonomousConfig>(
    'autonomous-config',
    DEFAULT_AUTONOMOUS_CONFIG
  )

  const [activeSettingsTab, setActiveSettingsTab] = useState('agents')

  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaLoading, setOllamaLoading] = useState(false)
  const [ollamaError, setOllamaError] = useState<string | null>(null)

  const [openRouterModels, setOpenRouterModels] = useState<string[]>([])
  const [openRouterLoading, setOpenRouterLoading] = useState(false)
  const [openRouterError, setOpenRouterError] = useState<string | null>(null)

  const defaultReferer = useMemo(() => {
    if (typeof window === 'undefined') {
      return 'http://localhost'
    }
    return window.location.origin
  }, [])

  const ensureAgentConfigs = useCallback(() => {
    if (!agentConfigs || agentConfigs.length === 0) {
      setAgentConfigs(DEFAULT_AGENT_CONFIGS)
      return
    }

    if (agentConfigs.some(config => !VALID_PROVIDERS.includes(config.provider as LLMProvider))) {
      const normalized = agentConfigs.map((config) => {
        if (!VALID_PROVIDERS.includes(config.provider as LLMProvider)) {
          return { ...config, provider: 'openai' as LLMProvider }
        }
        return config
      })
      setAgentConfigs(normalized)
    }
  }, [agentConfigs, setAgentConfigs])

  useEffect(() => {
    ensureAgentConfigs()
  }, [ensureAgentConfigs])

  useEffect(() => {
    if (!providerConfigs) {
      setProviderConfigs(cloneProviderDefaults())
    }
  }, [providerConfigs, setProviderConfigs])

  const ollamaBaseUrl = useMemo(() => {
    const fallback = DEFAULT_PROVIDER_SETTINGS.ollama.baseUrl ?? 'http://localhost:11434'
    return normalizeBaseUrl(providerConfigs?.ollama?.baseUrl, fallback)
  }, [providerConfigs?.ollama?.baseUrl])

  const openRouterBaseUrl = useMemo(() => {
    const fallback = DEFAULT_PROVIDER_SETTINGS.openrouter.baseUrl ?? 'https://openrouter.ai/api/v1'
    return normalizeBaseUrl(providerConfigs?.openrouter?.baseUrl, fallback)
  }, [providerConfigs?.openrouter?.baseUrl])

  const handleAgentConfigChange = useCallback(
    <Field extends keyof AgentConfig>(
      agentId: string,
      field: Field,
      value: AgentConfig[Field]
    ) => {
      const updatedConfigs = (agentConfigs || DEFAULT_AGENT_CONFIGS).map((config) =>
        config.id === agentId ? { ...config, [field]: value } : config
      )
      setAgentConfigs(updatedConfigs)
      onConfigChange?.(updatedConfigs)
    },
    [agentConfigs, onConfigChange, setAgentConfigs]
  )

  const handleProviderConfigChange = useCallback(
    <P extends keyof ProviderSettings>(
      provider: P,
      field: keyof ProviderSettings[P],
      value: ProviderSettings[P][keyof ProviderSettings[P]]
    ) => {
      const existing = providerConfigs ?? cloneProviderDefaults()
      const providerConfig = existing[provider] ?? {}
      const sanitizedValue = typeof value === 'string' ? (value.trim() === '' ? undefined : value) : value
      const updatedProviderConfig = {
        ...providerConfig,
        [field]: sanitizedValue
      }
      const updatedConfigs = {
        ...existing,
        [provider]: updatedProviderConfig
      } as ProviderSettings
      setProviderConfigs(updatedConfigs)
    },
    [providerConfigs, setProviderConfigs]
  )

  const handleAutonomousConfigChange = useCallback(
    <Field extends keyof AutonomousConfig>(field: Field, value: AutonomousConfig[Field]) => {
      const currentConfig = autonomousConfig || DEFAULT_AUTONOMOUS_CONFIG

      let nextValue = value
      if (field === 'maxCycles') {
        const numeric = typeof value === 'number' ? value : Number(value)
        const sanitized = Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0
        nextValue = sanitized as AutonomousConfig[Field]
      }

      const updatedConfig: AutonomousConfig = {
        ...currentConfig,
        [field]: nextValue
      }

      setAutonomousConfig(updatedConfig)
      onAutonomousChange?.(updatedConfig)
    },
    [autonomousConfig, onAutonomousChange, setAutonomousConfig]
  )

  const fetchOllamaModels = useCallback(async () => {
    const baseUrl = ollamaBaseUrl
    if (!baseUrl) {
      setOllamaModels([])
      setOllamaError('No Ollama host configured')
      return
    }

    setOllamaLoading(true)
    setOllamaError(null)

    try {
      const response = await fetch(`${baseUrl}/api/tags`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = (await response.json()) as OllamaTagResponse
      const models = Array.isArray(data?.models)
        ? data.models
            .map((model) => model?.name?.trim())
            .filter((name): name is string => Boolean(name))
        : []
      setOllamaModels(models)
      if (models.length === 0) {
        setOllamaError('No models found on the Ollama host')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setOllamaError(`Failed to load Ollama models: ${message}`)
      setOllamaModels([])
    } finally {
      setOllamaLoading(false)
    }
  }, [ollamaBaseUrl])

  const fetchOpenRouterModels = useCallback(async () => {
    const apiKey = providerConfigs?.openrouter?.apiKey?.trim()
    if (!apiKey) {
      setOpenRouterModels([])
      setOpenRouterError('Add an API key to fetch models automatically')
      return
    }

    setOpenRouterLoading(true)
    setOpenRouterError(null)

    try {
      const response = await fetch(`${openRouterBaseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': providerConfigs?.openrouter?.referer || defaultReferer,
          'X-Title':
            providerConfigs?.openrouter?.appName || DEFAULT_PROVIDER_SETTINGS.openrouter.appName || 'Collaborative Physicist'
        }
      })

      const payload = (await response.json().catch(() => {
        throw new Error(`Failed to parse OpenRouter response (HTTP ${response.status})`)
      })) as OpenRouterResponse

      if (!response.ok) {
        const errorDetails = payload?.error
        const errorMessage =
          (typeof errorDetails === 'string'
            ? errorDetails
            : typeof errorDetails?.message === 'string'
              ? errorDetails.message
              : null) || `HTTP ${response.status}`
        throw new Error(errorMessage)
      }
      const modelListSource = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.models)
          ? payload.models
          : []
      const models = modelListSource
        .map((item) => item?.id?.trim() || item?.name?.trim() || null)
        .filter((name): name is string => Boolean(name))
      setOpenRouterModels(models)
      if (models.length === 0) {
        setOpenRouterError('No models returned by OpenRouter')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setOpenRouterError(`Failed to load OpenRouter models: ${message}`)
      setOpenRouterModels([])
    } finally {
      setOpenRouterLoading(false)
    }
  }, [providerConfigs?.openrouter?.apiKey, providerConfigs?.openrouter?.referer, providerConfigs?.openrouter?.appName, openRouterBaseUrl, defaultReferer])

  useEffect(() => {
    if (providerConfigs?.ollama) {
      fetchOllamaModels()
    }
  }, [providerConfigs?.ollama, fetchOllamaModels])

  useEffect(() => {
    if (providerConfigs?.openrouter?.apiKey) {
      fetchOpenRouterModels()
    } else {
      setOpenRouterModels([])
      setOpenRouterError(null)
    }
  }, [providerConfigs?.openrouter, fetchOpenRouterModels])

  const resetToDefaults = useCallback(() => {
    setAgentConfigs(DEFAULT_AGENT_CONFIGS)
    setProviderConfigs(cloneProviderDefaults())
    setAutonomousConfig(DEFAULT_AUTONOMOUS_CONFIG)
    toast.success('Agent configurations reset to defaults')
  }, [setAgentConfigs, setProviderConfigs, setAutonomousConfig])

  const getModelOptions = useCallback(
    (agent: AgentConfig) => {
      if (agent.provider === 'ollama') {
        return ollamaModels
      }
      if (agent.provider === 'openrouter') {
        return openRouterModels.length > 0 ? openRouterModels : MODEL_SUGGESTIONS.openrouter || []
      }
      return MODEL_SUGGESTIONS[agent.provider] || []
    },
    [ollamaModels, openRouterModels]
  )

  const enrichModelOptions = useCallback((options: string[], currentModel: string) => {
    const cleaned = options
      .map(option => option?.trim())
      .filter((option): option is string => Boolean(option))
    if (currentModel && !cleaned.includes(currentModel)) {
      cleaned.push(currentModel)
    }
    return Array.from(new Set(cleaned))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Gear className="h-6 w-6" />
            Agent Settings
          </h2>
          <p className="text-muted-foreground">
            Configure agent behavior, models, providers, and autonomous operation
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults}>
            Reset to Defaults
          </Button>
        </div>
      </div>

      <Tabs value={activeSettingsTab} onValueChange={setActiveSettingsTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Robot className="h-4 w-4" />
            Agent Configuration
          </TabsTrigger>
          <TabsTrigger value="providers" className="flex items-center gap-2">
            <Gear className="h-4 w-4" />
            Provider Credentials
          </TabsTrigger>
          <TabsTrigger value="autonomous" className="flex items-center gap-2">
            <Lightning className="h-4 w-4" />
            Autonomous Mode
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-6">
          {(agentConfigs || DEFAULT_AGENT_CONFIGS).map((agent) => {
            const modelOptions = enrichModelOptions(getModelOptions(agent), agent.model)
            const isOllama = agent.provider === 'ollama'
            const isOpenRouter = agent.provider === 'openrouter'

            return (
              <Card key={agent.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Robot className="h-5 w-5" />
                      {agent.name}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={agent.enabled ? 'default' : 'secondary'}>
                        {agent.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <Switch
                        checked={agent.enabled}
                        onCheckedChange={(checked) =>
                          handleAgentConfigChange(agent.id, 'enabled', checked)
                        }
                      />
                    </div>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{agent.role}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`provider-${agent.id}`}>Provider</Label>
                      <Select
                        value={agent.provider}
                        onValueChange={(value) =>
                          handleAgentConfigChange(agent.id, 'provider', value)
                        }
                      >
                        <SelectTrigger id={`provider-${agent.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="spark">Spark (GitHub)</SelectItem>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="openrouter">OpenRouter</SelectItem>
                          <SelectItem value="ollama">Ollama (Local)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`model-${agent.id}`}>Model</Label>
                      <Select
                        value={agent.model}
                        onValueChange={(value) =>
                          handleAgentConfigChange(agent.id, 'model', value)
                        }
                        disabled={modelOptions.length === 0}
                      >
                        <SelectTrigger id={`model-${agent.id}`}>
                          <SelectValue placeholder="Select or enter a model" />
                        </SelectTrigger>
                        <SelectContent>
                          {modelOptions.length === 0 ? (
                            <SelectItem value="" disabled>
                              {isOllama
                                ? 'No Ollama models detected'
                                : isOpenRouter
                                  ? 'No OpenRouter models available'
                                  : 'No models configured'}
                            </SelectItem>
                          ) : (
                            modelOptions.map((model) => (
                              <SelectItem key={model} value={model}>
                                {model}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <Input
                        id={`model-input-${agent.id}`}
                        value={agent.model}
                        onChange={(e) =>
                          handleAgentConfigChange(agent.id, 'model', e.target.value)
                        }
                        placeholder="Enter a custom model identifier"
                      />
                      <p className="text-xs text-muted-foreground">
                        Choose from the list or type any model supported by the selected provider.
                      </p>
                      {isOllama && (
                        <div className="flex items-center justify-between text-xs">
                          <span className={ollamaError ? 'text-destructive' : 'text-muted-foreground'}>
                            {ollamaLoading
                              ? 'Loading models from Ollama...'
                              : ollamaError
                                ? ollamaError
                                : `Models loaded from ${ollamaBaseUrl}`}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchOllamaModels}
                            disabled={ollamaLoading}
                          >
                            Refresh
                          </Button>
                        </div>
                      )}
                      {isOpenRouter && (
                        <div className="flex items-center justify-between text-xs">
                          <span className={openRouterError ? 'text-destructive' : 'text-muted-foreground'}>
                            {openRouterLoading
                              ? 'Loading models from OpenRouter...'
                              : openRouterError
                                ? openRouterError
                                : openRouterModels.length > 0
                                  ? `Loaded ${openRouterModels.length} models`
                                  : 'Using static OpenRouter suggestions'}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchOpenRouterModels}
                            disabled={openRouterLoading}
                          >
                            Refresh
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`temperature-${agent.id}`}>
                        Temperature: {agent.temperature}
                      </Label>
                      <Input
                        id={`temperature-${agent.id}`}
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={agent.temperature}
                        onChange={(e) =>
                          handleAgentConfigChange(
                            agent.id,
                            'temperature',
                            parseFloat(e.target.value)
                          )
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`tokens-${agent.id}`}>Max Tokens</Label>
                      <Input
                        id={`tokens-${agent.id}`}
                        type="number"
                        value={agent.maxTokens}
                        onChange={(e) =>
                          handleAgentConfigChange(
                            agent.id,
                            'maxTokens',
                            parseInt(e.target.value, 10)
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`prompt-${agent.id}`}>System Prompt</Label>
                    <Textarea
                      id={`prompt-${agent.id}`}
                      value={agent.systemPrompt}
                      onChange={(e) =>
                        handleAgentConfigChange(agent.id, 'systemPrompt', e.target.value)
                      }
                      rows={4}
                      className="font-mono text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>

        <TabsContent value="providers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>OpenAI</CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure access to the OpenAI Chat Completions API.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="openai-api-key">API Key</Label>
                  <Input
                    id="openai-api-key"
                    type="password"
                    value={providerConfigs?.openai?.apiKey || ''}
                    onChange={(e) =>
                      handleProviderConfigChange('openai', 'apiKey', e.target.value)
                    }
                    placeholder="sk-..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openai-base-url">Base URL</Label>
                  <Input
                    id="openai-base-url"
                    value={providerConfigs?.openai?.baseUrl || ''}
                    onChange={(e) =>
                      handleProviderConfigChange('openai', 'baseUrl', e.target.value)
                    }
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openai-org">Organization (optional)</Label>
                  <Input
                    id="openai-org"
                    value={providerConfigs?.openai?.organization || ''}
                    onChange={(e) =>
                      handleProviderConfigChange('openai', 'organization', e.target.value)
                    }
                    placeholder="org-..."
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The API key is stored locally using Spark KV storage. Leave the base URL empty to use the default OpenAI endpoint.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>OpenRouter</CardTitle>
              <p className="text-sm text-muted-foreground">
                Connect to OpenRouter and synchronize available models for your agents.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="openrouter-api-key">API Key</Label>
                  <Input
                    id="openrouter-api-key"
                    type="password"
                    value={providerConfigs?.openrouter?.apiKey || ''}
                    onChange={(e) =>
                      handleProviderConfigChange('openrouter', 'apiKey', e.target.value)
                    }
                    placeholder="or-..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openrouter-base-url">Base URL</Label>
                  <Input
                    id="openrouter-base-url"
                    value={providerConfigs?.openrouter?.baseUrl || ''}
                    onChange={(e) =>
                      handleProviderConfigChange('openrouter', 'baseUrl', e.target.value)
                    }
                    placeholder="https://openrouter.ai/api/v1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openrouter-referer">HTTP Referer</Label>
                  <Input
                    id="openrouter-referer"
                    value={providerConfigs?.openrouter?.referer || ''}
                    onChange={(e) =>
                      handleProviderConfigChange('openrouter', 'referer', e.target.value)
                    }
                    placeholder={defaultReferer}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openrouter-app">Application Name</Label>
                  <Input
                    id="openrouter-app"
                    value={providerConfigs?.openrouter?.appName || ''}
                    onChange={(e) =>
                      handleProviderConfigChange('openrouter', 'appName', e.target.value)
                    }
                    placeholder="Collaborative Physicist"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchOpenRouterModels}
                  disabled={openRouterLoading}
                >
                  Refresh model catalog
                </Button>
                <span className={`text-xs ${openRouterError ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {openRouterLoading
                    ? 'Requesting latest model catalog...'
                    : openRouterError
                      ? openRouterError
                      : openRouterModels.length > 0
                        ? `Cached ${openRouterModels.length} models`
                        : 'Model suggestions will use bundled defaults until a catalog is fetched.'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ollama</CardTitle>
              <p className="text-sm text-muted-foreground">
                Connect to a local Ollama runtime and expose the downloaded models to your agents.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ollama-base-url">Base URL</Label>
                  <Input
                    id="ollama-base-url"
                    value={providerConfigs?.ollama?.baseUrl || ''}
                    onChange={(e) =>
                      handleProviderConfigChange('ollama', 'baseUrl', e.target.value)
                    }
                    placeholder="http://localhost:11434"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchOllamaModels}
                  disabled={ollamaLoading}
                >
                  Refresh installed models
                </Button>
                <span className={`text-xs ${ollamaError ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {ollamaLoading
                    ? 'Contacting Ollama host...'
                    : ollamaError
                      ? ollamaError
                      : ollamaModels.length > 0
                        ? `Detected ${ollamaModels.length} models`
                        : `Watching ${ollamaBaseUrl} for models.`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Ollama requests are issued directly from your browser. Ensure the host is accessible and CORS is enabled if connecting remotely.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="autonomous" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightning className="h-5 w-5" />
                Autonomous Operation
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure the system to run continuously without manual intervention
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="autonomous-enabled" className="text-base font-medium">
                    Autonomous Configuration
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Configure settings for autonomous mode (start from Collaboration tab)
                  </p>
                </div>
                <Switch
                  id="autonomous-enabled"
                  checked={autonomousConfig?.enabled ?? false}
                  onCheckedChange={() => {
                    toast.info('Autonomous mode can be started from the Collaboration tab')
                  }}
                  disabled
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="max-cycles">Maximum Cycles</Label>
                  <Input
                    id="max-cycles"
                    type="number"
                    value={autonomousConfig?.maxCycles ?? DEFAULT_AUTONOMOUS_CONFIG.maxCycles}
                    onChange={(e) => {
                      const parsed = Number.parseInt(e.target.value, 10)
                      handleAutonomousConfigChange('maxCycles', parsed)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = unlimited cycles
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="stop-on-gamma" className="text-sm font-medium">
                      Stop on Phys-Gamma Decision
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Allow Phys-Gamma to terminate the process
                    </p>
                  </div>
                  <Switch
                    id="stop-on-gamma"
                    checked={autonomousConfig?.stopOnGammaDecision ?? true}
                    onCheckedChange={(checked) =>
                      handleAutonomousConfigChange('stopOnGammaDecision', checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="continue-overnight" className="text-sm font-medium">
                      Continue Overnight
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Keep running even during off-hours
                    </p>
                  </div>
                  <Switch
                    id="continue-overnight"
                    checked={autonomousConfig?.continueOvernight ?? true}
                    onCheckedChange={(checked) =>
                      handleAutonomousConfigChange('continueOvernight', checked)
                    }
                  />
                </div>
              </div>

              {autonomousConfig?.enabled && (
                <div className="bg-accent/20 border border-accent rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-accent-foreground" />
                    <span className="text-sm font-medium">Autonomous Mode Active</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    The system will run continuously without delays. Each agent will immediately start after the previous one finishes. Monitor progress in the Agent Collaboration tab.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAutonomousConfigChange('enabled', false)}
                    >
                      Stop Autonomous Mode
                    </Button>
                  </div>
                </div>
              )}

              {!autonomousConfig?.enabled && (
                <div className="bg-muted/50 border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Autonomous Mode Disabled</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Enable autonomous mode to have agents work continuously without manual intervention.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAutonomousConfigChange('enabled', true)}
                    >
                      Start Autonomous Mode
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
