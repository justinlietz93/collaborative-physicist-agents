import { AgentResponse, PhysicsGoal, KnowledgeEntry } from '@/App'
import { AgentConfig, ProviderSettings, DEFAULT_PROVIDER_SETTINGS, LLMProvider } from '@/types/agent'
import {
  AgentKnowledgeContext,
  AgentName,
  buildConceptTags,
  buildCollaborationContext,
  deriveGraphInsights,
  formatAgentKnowledgeContext,
  rankVectorMatches
} from '@/lib/knowledge-utils'

export type { AgentName }

// Global spark declaration
declare global {
  interface Window {
    spark?: {
      llmPrompt: (strings: TemplateStringsArray, ...values: unknown[]) => string
      llm: (prompt: string, modelName?: string, jsonMode?: boolean) => Promise<string>
    }
  }
}

const spark = typeof window !== 'undefined' ? window.spark : undefined

const COMPLETION_MARKER = '<END_OF_RESPONSE>'
const MAX_CONTINUATION_ATTEMPTS = 3
const TERMINAL_CHARACTERS = new Set(['.', '!', '?', '…', ']', ')', '}', '>', '”', '"', "'"])

export interface AutonomousState {
  isRunning: boolean
  currentAgent: AgentName
  currentCycle: number
  isAutonomous: boolean
}

/**
 * Generates a response from an AI agent based on the current context
 */
export async function generateAgentResponse(
  agentName: AgentName,
  agentConfig: AgentConfig,
  goal: PhysicsGoal,
  derivationHistory: AgentResponse[],
  knowledgeBase: KnowledgeEntry[],
  providerConfigs?: ProviderSettings
): Promise<string> {
  console.log('Generating response for agent:', agentName)

  const collaborationContext = buildCollaborationContext(goal, derivationHistory, knowledgeBase)
  const vectorMatches = rankVectorMatches(collaborationContext.documents, collaborationContext.queryText)
  const graphInsights = deriveGraphInsights(vectorMatches, collaborationContext.documents)
  const agentKnowledge = formatAgentKnowledgeContext(collaborationContext, vectorMatches, graphInsights)

  const contextSections = buildContextSections(agentKnowledge)
  const basePrompt = buildInitialUserPrompt(goal, contextSections)
  const chatMessages = buildChatMessages(agentConfig.systemPrompt, basePrompt)
  const textPrompt = buildTextPrompt(agentConfig.systemPrompt, basePrompt)

  console.log('Calling LLM with prompt for agent:', agentName)
  const initialResponse = await callProviderLLM(agentConfig, providerConfigs, chatMessages, textPrompt)
  console.log('LLM response received, length:', initialResponse.length)

  const completed = await ensureCompletion(
    agentConfig,
    initialResponse,
    contextSections,
    agentName,
    providerConfigs
  )
  console.log('Final response length after completion handling:', completed.length)

  return normalizeCompletedResponse(completed)
}

function buildContextSections(agentKnowledge: AgentKnowledgeContext): {
  collaboration: string
  vector: string
  graph: string
  focus: string
} {
  const collaboration = agentKnowledge.collaborationDigest

  const vector = agentKnowledge.vectorHighlights.length > 0
    ? agentKnowledge.vectorHighlights.map((entry, index) => `${index + 1}. ${entry}`).join('\n\n')
    : 'No high-similarity entries retrieved from the vector store. Focus on deriving fresh insights while keeping goal alignment.'

  const graph = agentKnowledge.knowledgeGraphInsights.length > 0
    ? agentKnowledge.knowledgeGraphInsights.join('\n\n')
    : 'Knowledge graph reveals no strong relational context yet. Explicitly articulate new linkages you establish.'

  const focusItems = agentKnowledge.collaborationFocus
  const focus = focusItems.length > 0
    ? focusItems.map((entry, index) => `${index + 1}. ${entry}`).join('\n')
    : 'No unresolved action items detected. Continue advancing the shared derivation meaningfully.'

  return { collaboration, vector, graph, focus }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function buildInitialUserPrompt(
  goal: PhysicsGoal,
  contextSections: { collaboration: string; vector: string; graph: string; focus: string }
): string {
  const objectives = goal.objectives?.length ? goal.objectives.join(', ') : 'None provided'
  const constraints = goal.constraints?.length ? goal.constraints.join(', ') : 'None provided'

  return [
    '<GoalContract>',
    `Research Goal: ${goal.title}`,
    `Domain: ${goal.domain}`,
    `Description: ${goal.description}`,
    `Objectives: ${objectives}`,
    `Constraints: ${constraints}`,
    '</GoalContract>',
    '',
    '<CollaborationDigest>',
    contextSections.collaboration,
    '</CollaborationDigest>',
    '',
    '<VectorStoreContext>',
    contextSections.vector,
    '</VectorStoreContext>',
    '',
    '<KnowledgeGraphContext>',
    contextSections.graph,
    '</KnowledgeGraphContext>',
    '',
    '<CollaborationFocus>',
    contextSections.focus,
    '</CollaborationFocus>',
    '',
    'TASK: Provide a complete contribution to this physics derivation that explicitly builds upon the collaboration history and integrates relevant knowledge.',
    '',
    'RESPONSE REQUIREMENTS:',
    '1. Reference the specific prior agent work or knowledge entries that you build upon.',
    '2. Maintain rigorous mathematical derivations with all steps shown, using LaTeX (\\[ \\] for block, \\( \\) for inline).',
    '3. Provide clear physical explanations accompanying each derivation segment.',
    '4. Address gaps, TODOs, or open questions implied by the collaboration digest.',
    '5. Resolve relevant collaboration focus items or describe how you progressed them.',
    `6. End your response with the exact marker ${COMPLETION_MARKER} on its own line.`,
    '7. Ensure the narrative is continuous and never terminates mid-sentence, mid-equation, or mid-thought.',
    '',
    'Begin your contribution now.'
  ].join('\n')
}

function buildContinuationUserPrompt(
  missingMarker: boolean,
  priorResponse: string,
  contextSections: { collaboration: string; vector: string; graph: string; focus: string }
): string {
  const markerInstruction = missingMarker
    ? `did not conclude with the required marker ${COMPLETION_MARKER}.`
    : 'appears to have stopped mid-thought even though the marker was emitted.'

  return [
    `The previous output ${markerInstruction} Continue seamlessly from where it stopped, ensuring all partial sentences, equations, and code fences are finished cleanly.`,
    '',
    '<PriorOutput>',
    priorResponse,
    '</PriorOutput>',
    '',
    '<CollaborationDigest>',
    contextSections.collaboration,
    '</CollaborationDigest>',
    '',
    '<VectorStoreContext>',
    contextSections.vector,
    '</VectorStoreContext>',
    '',
    '<KnowledgeGraphContext>',
    contextSections.graph,
    '</KnowledgeGraphContext>',
    '',
    '<CollaborationFocus>',
    contextSections.focus,
    '</CollaborationFocus>',
    '',
    'REQUIREMENTS:',
    '- Resume exactly where the prior text halted, finishing incomplete sentences or equations first.',
    '- Do not restate sections that are already complete.',
    '- Add any missing conclusions or summaries to provide closure.',
    `- Address any relevant outstanding focus items before concluding.`,
    `- End with the marker ${COMPLETION_MARKER} on its own line.`,
    '- Double-check that all LaTeX environments, parentheses, and code fences are balanced before finishing.'
  ].join('\n')
}

function buildChatMessages(systemPrompt: string, userPrompt: string): ChatMessage[] {
  const messages: ChatMessage[] = []
  const trimmedSystem = systemPrompt?.trim()
  if (trimmedSystem) {
    messages.push({ role: 'system', content: trimmedSystem })
  }
  messages.push({ role: 'user', content: userPrompt })
  return messages
}

function buildTextPrompt(systemPrompt: string, userPrompt: string): string {
  const trimmedSystem = systemPrompt?.trim()
  if (!trimmedSystem) {
    return userPrompt
  }

  if (spark?.llmPrompt) {
    return spark.llmPrompt`
      ${trimmedSystem}

      ${userPrompt}
    `
  }

  return `${trimmedSystem}\n\n${userPrompt}`
}

function normalizeProvider(provider: string | undefined): LLMProvider {
  if (!provider) {
    return 'spark'
  }

  if (provider === 'xai') {
    return 'openai'
  }

  const allowed: LLMProvider[] = ['spark', 'openai', 'openrouter', 'ollama']
  if (allowed.includes(provider as LLMProvider)) {
    return provider as LLMProvider
  }

  return 'openai'
}

function resolveBaseUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  const base = trimmed && trimmed.length > 0 ? trimmed : fallback
  return base.replace(/\/+$/u, '')
}

interface ChatRequestBody {
  model: string
  messages: ChatMessage[]
  temperature: number
  stream: false
  max_tokens?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractChatError(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    const { error } = payload
    if (typeof error === 'string') {
      return error
    }
    if (isRecord(error) && typeof error.message === 'string') {
      return error.message
    }
  }
  return `HTTP ${status}`
}

function extractChatContent(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }
  const choices = payload.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    return null
  }
  const [firstChoice] = choices
  if (!isRecord(firstChoice)) {
    return null
  }
  const message = firstChoice.message
  if (!isRecord(message)) {
    return null
  }
  const content = message.content
  return typeof content === 'string' ? content : null
}

interface OllamaSegment { text?: string }

function extractOllamaMessageCandidate(payload: unknown): string | unknown[] | null {
  if (!isRecord(payload)) {
    return null
  }

  const { message, response } = payload

  if (typeof message === 'string') {
    return message
  }
  if (isRecord(message) && typeof message.content === 'string') {
    return message.content
  }
  if (Array.isArray(message)) {
    return message
  }

  if (typeof response === 'string') {
    return response
  }
  if (isRecord(response) && typeof response.content === 'string') {
    return response.content
  }
  if (Array.isArray(response)) {
    return response
  }

  return null
}

function flattenOllamaSegments(segments: unknown[]): string {
  return segments
    .map(segment => {
      if (typeof segment === 'string') {
        return segment
      }
      if (isRecord(segment) && typeof (segment as OllamaSegment).text === 'string') {
        return (segment as OllamaSegment).text as string
      }
      return ''
    })
    .join('')
}

function extractOllamaError(payload: unknown, status: number): string {
  if (!isRecord(payload)) {
    return `HTTP ${status}`
  }

  const error = payload.error ?? payload.message
  if (typeof error === 'string') {
    return error
  }

  return `HTTP ${status}`
}

async function callProviderLLM(
  agentConfig: AgentConfig,
  providerConfigs: ProviderSettings | undefined,
  messages: ChatMessage[],
  textPrompt: string
): Promise<string> {
  const provider = normalizeProvider(agentConfig.provider)
  const configs = providerConfigs ?? DEFAULT_PROVIDER_SETTINGS

  switch (provider) {
    case 'openai':
      return callOpenAI(agentConfig, configs.openai, messages)
    case 'openrouter':
      return callOpenRouter(agentConfig, configs.openrouter, messages)
    case 'ollama':
      return callOllama(agentConfig, configs.ollama, messages)
    case 'spark':
    default:
      return callSpark(agentConfig, textPrompt)
  }
}

async function callSpark(agentConfig: AgentConfig, prompt: string): Promise<string> {
  if (!spark?.llm) {
    throw new Error('Spark provider selected but the runtime LLM interface is unavailable')
  }
  const model = agentConfig.model || 'gpt-4o'
  return spark.llm(prompt, model)
}

async function callOpenAI(
  agentConfig: AgentConfig,
  config: ProviderSettings['openai'],
  messages: ChatMessage[]
): Promise<string> {
  const apiKey = config?.apiKey?.trim()
  if (!apiKey) {
    throw new Error('OpenAI provider selected but no API key is configured')
  }

  const fallback = DEFAULT_PROVIDER_SETTINGS.openai?.baseUrl || 'https://api.openai.com/v1'
  const baseUrl = resolveBaseUrl(config?.baseUrl, fallback)
  const url = `${baseUrl}/chat/completions`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }
  if (config?.organization) {
    headers['OpenAI-Organization'] = config.organization
  }

  const body: ChatRequestBody = {
    model: agentConfig.model || 'gpt-4o',
    messages,
    temperature: agentConfig.temperature ?? 0.7,
    stream: false
  }

  if (agentConfig.maxTokens && agentConfig.maxTokens > 0) {
    body.max_tokens = agentConfig.maxTokens
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  const payload = await response.json().catch(() => {
    throw new Error(`Failed to parse OpenAI response (HTTP ${response.status})`)
  })

  if (!response.ok) {
    throw new Error(extractChatError(payload, response.status))
  }

  const content = extractChatContent(payload)
  if (!content) {
    throw new Error('OpenAI response did not contain assistant content')
  }

  return content
}

async function callOpenRouter(
  agentConfig: AgentConfig,
  config: ProviderSettings['openrouter'],
  messages: ChatMessage[]
): Promise<string> {
  const apiKey = config?.apiKey?.trim()
  if (!apiKey) {
    throw new Error('OpenRouter provider selected but no API key is configured')
  }

  const fallback = DEFAULT_PROVIDER_SETTINGS.openrouter?.baseUrl || 'https://openrouter.ai/api/v1'
  const baseUrl = resolveBaseUrl(config?.baseUrl, fallback)
  const url = `${baseUrl}/chat/completions`

  const defaultReferer = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': config?.referer?.trim() || defaultReferer,
    'X-Title': config?.appName?.trim() || DEFAULT_PROVIDER_SETTINGS.openrouter?.appName || 'Collaborative Physicist'
  }

  const body: ChatRequestBody = {
    model: agentConfig.model || 'openrouter/auto',
    messages,
    temperature: agentConfig.temperature ?? 0.7,
    stream: false
  }

  if (agentConfig.maxTokens && agentConfig.maxTokens > 0) {
    body.max_tokens = agentConfig.maxTokens
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  const payload = await response.json().catch(() => {
    throw new Error(`Failed to parse OpenRouter response (HTTP ${response.status})`)
  })

  if (!response.ok) {
    throw new Error(extractChatError(payload, response.status))
  }

  const content = extractChatContent(payload)
  if (!content) {
    throw new Error('OpenRouter response did not contain assistant content')
  }

  return content
}

async function callOllama(
  agentConfig: AgentConfig,
  config: ProviderSettings['ollama'],
  messages: ChatMessage[]
): Promise<string> {
  const fallback = DEFAULT_PROVIDER_SETTINGS.ollama?.baseUrl || 'http://localhost:11434'
  const baseUrl = resolveBaseUrl(config?.baseUrl, fallback)
  if (!baseUrl) {
    throw new Error('Ollama provider selected but no base URL is configured')
  }

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: agentConfig.model || 'llama3.2',
      messages,
      stream: false,
      options: {
        temperature: agentConfig.temperature ?? 0.7,
        ...(agentConfig.maxTokens && agentConfig.maxTokens > 0
          ? { num_predict: agentConfig.maxTokens }
          : {})
      }
    })
  })

  const payload = await response.json().catch(() => {
    throw new Error(`Failed to parse Ollama response (HTTP ${response.status})`)
  })

  if (!response.ok) {
    throw new Error(extractOllamaError(payload, response.status))
  }

  const candidate = extractOllamaMessageCandidate(payload)
  if (typeof candidate === 'string') {
    return candidate
  }

  if (Array.isArray(candidate)) {
    return flattenOllamaSegments(candidate)
  }

  throw new Error('Ollama response did not contain assistant content')
}

async function ensureCompletion(
  agentConfig: AgentConfig,
  initialResponse: string,
  contextSections: { collaboration: string; vector: string; graph: string; focus: string },
  agentName: AgentName,
  providerConfigs?: ProviderSettings
): Promise<string> {
  let response = initialResponse
  let attempt = 0

  while (!isResponseComplete(response) && attempt < MAX_CONTINUATION_ATTEMPTS) {
    const missingMarker = !containsCompletionMarker(response)
    console.warn(
      `Response from ${agentName} ${missingMarker ? 'missing completion marker' : 'appears truncated'}. Attempting continuation ${attempt + 1}.`
    )
    const continuationPrompt = buildContinuationUserPrompt(missingMarker, response, contextSections)
    const continuationMessages = buildChatMessages(agentConfig.systemPrompt, continuationPrompt)
    const continuationTextPrompt = buildTextPrompt(agentConfig.systemPrompt, continuationPrompt)

    const continuation = await callProviderLLM(
      agentConfig,
      providerConfigs,
      continuationMessages,
      continuationTextPrompt
    )

    response = `${response.trim()}\n\n${continuation.trim()}`
    attempt += 1
  }

  if (!containsCompletionMarker(response)) {
    console.warn(`Response from ${agentName} still missing completion marker after ${MAX_CONTINUATION_ATTEMPTS} attempts. Appending closure notice.`)
    response = `${response.trim()}\n\nCompletion marker was not automatically generated. Adding concluding marker now.\n${COMPLETION_MARKER}`
  } else if (!isResponseComplete(response)) {
    console.warn(`Response from ${agentName} remained structurally incomplete after ${MAX_CONTINUATION_ATTEMPTS} attempts. Normalizing with manual closure.`)
    const markerPattern = new RegExp(`\\n?${escapeRegExp(COMPLETION_MARKER)}\\s*$`)
    const withoutMarker = response.replace(markerPattern, '').trim()
    response = `${withoutMarker}\n\nAutonomous run terminated early; marker appended to maintain protocol.\n${COMPLETION_MARKER}`
  }

  return response
}

function containsCompletionMarker(response: string): boolean {
  return response.includes(COMPLETION_MARKER)
}

function isResponseComplete(response: string): boolean {
  if (!containsCompletionMarker(response)) {
    return false
  }

  const markerIndex = response.lastIndexOf(COMPLETION_MARKER)
  if (markerIndex === -1) {
    return false
  }

  const beforeMarker = response.slice(0, markerIndex).trim()
  if (!beforeMarker) {
    return false
  }

  if (hasUnbalancedStructures(beforeMarker)) {
    return false
  }

  const trimmed = beforeMarker.replace(/\s+$/u, '')
  const lastCharacter = trimmed.at(-1) ?? ''
  if (!TERMINAL_CHARACTERS.has(lastCharacter)) {
    return false
  }

  return true
}

function hasUnbalancedStructures(text: string): boolean {
  const codeFences = (text.match(/```/g) || []).length
  if (codeFences % 2 !== 0) {
    return true
  }

  const inlineMathOpen = (text.match(/\\\(/g) || []).length
  const inlineMathClose = (text.match(/\\\)/g) || []).length
  if (inlineMathOpen !== inlineMathClose) {
    return true
  }

  const blockMathOpen = (text.match(/\\\[/g) || []).length
  const blockMathClose = (text.match(/\\\]/g) || []).length
  if (blockMathOpen !== blockMathClose) {
    return true
  }

  const beginEnvironments = (text.match(/\\begin\{[^}]+\}/g) || []).length
  const endEnvironments = (text.match(/\\end\{[^}]+\}/g) || []).length
  if (beginEnvironments !== endEnvironments) {
    return true
  }

  const leftDelimiters = (text.match(/\\left/g) || []).length
  const rightDelimiters = (text.match(/\\right/g) || []).length
  if (leftDelimiters !== rightDelimiters) {
    return true
  }

  if (hasImbalancedStandardDelimiters(text)) {
    return true
  }

  return false
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasImbalancedStandardDelimiters(text: string): boolean {
  const sanitized = text.replace(/```[\s\S]*?```/g, '')
  const pairs: { open: string; close: string; tolerance: number }[] = [
    { open: '(', close: ')', tolerance: 1 },
    { open: '[', close: ']', tolerance: 1 },
    { open: '{', close: '}', tolerance: 1 }
  ]

  return pairs.some(({ open, close, tolerance }) => {
    const openCount = (sanitized.match(new RegExp(`\\${open}`, 'g')) || []).length
    const closeCount = (sanitized.match(new RegExp(`\\${close}`, 'g')) || []).length
    return Math.abs(openCount - closeCount) > tolerance
  })
}

function normalizeCompletedResponse(response: string): string {
  const markerIndex = response.lastIndexOf(COMPLETION_MARKER)
  if (markerIndex === -1) {
    return response.trim()
  }

  const beforeMarker = response.slice(0, markerIndex).trim()
  return `${beforeMarker}\n${COMPLETION_MARKER}`
}

/**
 * Determines the next agent in the collaboration sequence
 */
export function getNextAgent(current: AgentName, currentCycle: number): { next: AgentName; newCycle: number } {
  if (current === 'Phys-Alpha') {
    return { next: 'Phys-Beta', newCycle: currentCycle }
  } else if (current === 'Phys-Beta') {
    if (currentCycle % 2 === 0) {
      return { next: 'Phys-Gamma', newCycle: currentCycle }
    } else {
      return { next: 'Phys-Alpha', newCycle: currentCycle + 1 }
    }
  } else {
    return { next: 'Phys-Alpha', newCycle: currentCycle + 1 }
  }
}

/**
 * Creates a new agent response object
 */
export function createAgentResponse(
  agentName: AgentName,
  content: string,
  cycle: number,
  goalId: string
): AgentResponse {
  return {
    id: `response-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    agent: agentName,
    content,
    timestamp: new Date().toISOString(),
    cycle,
    goalId
  }
}

/**
 * Creates a knowledge entry from an agent response
 */
export function createKnowledgeEntry(
  agentName: AgentName,
  content: string,
  cycle: number,
  goalTitle: string,
  domain: string
): KnowledgeEntry {
  const baseTags = [domain, agentName.toLowerCase(), 'derivation']
  return {
    id: `knowledge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: `${agentName} - Cycle ${cycle}`,
    content,
    source: `Agent Collaboration - ${goalTitle}`,
    tags: buildConceptTags(content, baseTags),
    timestamp: new Date().toISOString()
  }
}
