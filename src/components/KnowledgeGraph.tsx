import { useState, useEffect, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Network, MagnifyingGlass, Link, ArrowsOut, ArrowsIn } from '@phosphor-icons/react'
import { KnowledgeEntry, AgentResponse, PhysicsGoal } from '@/App'
import {
  extractPhysicsConcepts,
  tokenize,
  termFrequencyVector,
  cosineSimilarity
} from '@/lib/knowledge-utils'

interface KnowledgeGraphProps {
  knowledgeBase: KnowledgeEntry[]
  derivationHistory: AgentResponse[]
  goals: PhysicsGoal[]
}

interface NodeConnection {
  id: string
  strength: number
  relationship: GraphConnection['relationship']
}

interface GraphNode {
  id: string
  label: string
  type: 'goal' | 'agent_response' | 'knowledge_entry' | 'concept'
  content?: string
  connections: NodeConnection[]
  tags?: string[]
  timestamp?: string
  x?: number
  y?: number
  vx?: number
  vy?: number
  radius?: number
}

interface GraphConnection {
  source: string
  target: string
  relationship:
    | 'derives_from'
    | 'references'
    | 'builds_on'
    | 'contradicts'
    | 'contains_concept'
    | 'similar_to'
  strength: number
}

export function KnowledgeGraph({ knowledgeBase, derivationHistory, goals }: KnowledgeGraphProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [connections, setConnections] = useState<GraphConnection[]>([])
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string>('all')
  const [maxNodes, setMaxNodes] = useState([100])
  const [zoom, setZoom] = useState(0.5)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)

  const nodeCount = nodes.length

  const prominentConnections = useMemo(() => {
    if (!selectedNode) return []

    return selectedNode.connections
      .map(connection => {
        const target = nodes.find(node => node.id === connection.id)
        if (!target) return null
        return {
          id: connection.id,
          label: target.label,
          relationship: connection.relationship,
          strength: connection.strength,
          type: target.type
        }
      })
      .filter((item): item is {
        id: string
        label: string
        relationship: GraphConnection['relationship']
        strength: number
        type: GraphNode['type']
      } => item !== null)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 6)
  }, [selectedNode, nodes])

  // Build knowledge graph from data
  const { filteredNodes, filteredConnections } = useMemo(() => {
    const newNodes: GraphNode[] = []
    const newConnections: GraphConnection[] = []

    // Add goal nodes
    goals.forEach(goal => {
      newNodes.push({
        id: `goal-${goal.id}`,
        label: goal.title,
        type: 'goal',
        content: goal.description,
        connections: [],
        tags: [goal.domain],
        timestamp: goal.createdAt,
        radius: 15
      })
    })

    // Add agent response nodes
    derivationHistory.forEach(response => {
      const concepts = extractPhysicsConcepts(response.content)
      newNodes.push({
        id: `response-${response.id}`,
        label: `${response.agent} - Cycle ${response.cycle}`,
        type: 'agent_response',
        content: response.content,
        connections: [],
        tags: [response.agent.toLowerCase(), ...concepts],
        timestamp: response.timestamp,
        radius: 10
      })

      // Connect to goal
      newConnections.push({
        source: `response-${response.id}`,
        target: `goal-${response.goalId}`,
        relationship: 'derives_from',
        strength: 0.85
      })

      // Connect concepts
      concepts.forEach(concept => {
        const conceptId = `concept-${concept}`
        if (!newNodes.find(n => n.id === conceptId)) {
          newNodes.push({
            id: conceptId,
            label: concept,
            type: 'concept',
            connections: [],
            radius: 6
          })
        }
        newConnections.push({
          source: `response-${response.id}`,
          target: conceptId,
          relationship: 'contains_concept',
          strength: 0.65
        })
      })
    })

    // Add knowledge base nodes
    knowledgeBase.forEach(entry => {
      const concepts = extractPhysicsConcepts(entry.content)
      newNodes.push({
        id: `knowledge-${entry.id}`,
        label: entry.title,
        type: 'knowledge_entry',
        content: entry.content,
        connections: [],
        tags: [...entry.tags, ...concepts],
        timestamp: entry.timestamp,
        radius: 8
      })

      // Connect concepts
      concepts.forEach(concept => {
        const conceptId = `concept-${concept}`
        if (!newNodes.find(n => n.id === conceptId)) {
          newNodes.push({
            id: conceptId,
            label: concept,
            type: 'concept',
            connections: [],
            radius: 6
          })
        }
        newConnections.push({
          source: `knowledge-${entry.id}`,
          target: conceptId,
          relationship: 'contains_concept',
          strength: 0.65
        })
      })
    })

    // Build chronological connections for agent responses
    const responsesByGoal = derivationHistory.reduce((acc, response) => {
      if (!acc[response.goalId]) acc[response.goalId] = []
      acc[response.goalId].push(response)
      return acc
    }, {} as Record<string, AgentResponse[]>)

    Object.values(responsesByGoal).forEach(responses => {
      const sorted = responses.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      
      for (let i = 1; i < sorted.length; i++) {
        newConnections.push({
          source: `response-${sorted[i].id}`,
          target: `response-${sorted[i-1].id}`,
          relationship: 'builds_on',
          strength: 0.8
        })
      }
    })

    const nodesById = new Map(newNodes.map(node => [node.id, node]))

    // Aggregate textual context for concept nodes to gauge similarity
    const conceptContext = new Map<string, string>()
    newConnections.forEach(connection => {
      if (connection.relationship !== 'contains_concept') return
      const conceptNodeId = connection.source.startsWith('concept-')
        ? connection.source
        : connection.target
      const linkedNodeId = connection.source.startsWith('concept-')
        ? connection.target
        : connection.source

      const conceptNode = nodesById.get(conceptNodeId)
      const linkedNode = nodesById.get(linkedNodeId)
      if (!conceptNode || !linkedNode) return

      const linkedText = [linkedNode.label, linkedNode.content]
        .filter(Boolean)
        .join(' ')
      const existing = conceptContext.get(conceptNodeId) || ''
      conceptContext.set(conceptNodeId, `${existing} ${linkedText}`.trim())
    })

    const conceptNodes = newNodes.filter(node => node.type === 'concept')
    const conceptVectors = new Map<string, Map<string, number>>()
    conceptNodes.forEach(node => {
      const text = conceptContext.get(node.id) || node.label
      const tokens = tokenize(text)
      conceptVectors.set(node.id, termFrequencyVector(tokens))
    })

    const conceptSimilarityThreshold = 0.18
    for (let i = 0; i < conceptNodes.length; i++) {
      for (let j = i + 1; j < conceptNodes.length; j++) {
        const vectorA = conceptVectors.get(conceptNodes[i].id)
        const vectorB = conceptVectors.get(conceptNodes[j].id)
        if (!vectorA || !vectorB) continue

        const similarity = cosineSimilarity(vectorA, vectorB)
        if (similarity >= conceptSimilarityThreshold) {
          newConnections.push({
            source: conceptNodes[i].id,
            target: conceptNodes[j].id,
            relationship: 'similar_to',
            strength: 0.35 + similarity * 0.5
          })
        }
      }
    }

    const narrativeNodes = newNodes.filter(node =>
      (node.type === 'agent_response' || node.type === 'knowledge_entry') && node.content
    )
    const narrativeVectors = new Map<string, Map<string, number>>()
    narrativeNodes.forEach(node => {
      const tokens = tokenize(node.content || '')
      narrativeVectors.set(node.id, termFrequencyVector(tokens))
    })

    const narrativeSimilarityThreshold = 0.22
    for (let i = 0; i < narrativeNodes.length; i++) {
      for (let j = i + 1; j < narrativeNodes.length; j++) {
        const vectorA = narrativeVectors.get(narrativeNodes[i].id)
        const vectorB = narrativeVectors.get(narrativeNodes[j].id)
        if (!vectorA || !vectorB) continue

        const similarity = cosineSimilarity(vectorA, vectorB)
        if (similarity >= narrativeSimilarityThreshold) {
          newConnections.push({
            source: narrativeNodes[i].id,
            target: narrativeNodes[j].id,
            relationship: 'similar_to',
            strength: 0.3 + similarity * 0.6
          })
        }
      }
    }

    // Derive node-centric connection map with adaptive weighting
    const neighborMap = new Map<string, NodeConnection[]>()
    const registerNeighbor = (
      sourceId: string,
      targetId: string,
      relationship: GraphConnection['relationship'],
      strength: number
    ) => {
      if (!neighborMap.has(sourceId)) {
        neighborMap.set(sourceId, [])
      }
      const neighbors = neighborMap.get(sourceId)!
      const existing = neighbors.find(neighbor => neighbor.id === targetId && neighbor.relationship === relationship)
      if (existing) {
        existing.strength = Math.max(existing.strength, strength)
      } else {
        neighbors.push({ id: targetId, relationship, strength })
      }
    }

    newConnections.forEach(connection => {
      registerNeighbor(connection.source, connection.target, connection.relationship, connection.strength)
      registerNeighbor(connection.target, connection.source, connection.relationship, connection.strength)
    })

    const MAX_STRONG_CONNECTIONS = 8
    neighborMap.forEach(neighbors => {
      neighbors.sort((a, b) => b.strength - a.strength)
      neighbors.forEach((neighbor, index) => {
        if (index < MAX_STRONG_CONNECTIONS) {
          neighbor.strength = Math.min(1, neighbor.strength * 1.05)
        } else {
          neighbor.strength = Math.max(0.1, neighbor.strength * 0.5)
        }
      })
    })

    newNodes.forEach(node => {
      node.connections = neighborMap.get(node.id) || []
    })

    const connectionStrengthLookup = (source: string, target: string) => {
      const neighbors = neighborMap.get(source)
      if (!neighbors) return undefined
      const match = neighbors.find(neighbor => neighbor.id === target)
      return match?.strength
    }

    newConnections.forEach(connection => {
      const forward = connectionStrengthLookup(connection.source, connection.target)
      const reverse = connectionStrengthLookup(connection.target, connection.source)
      const updatedStrength = Math.max(
        forward ?? connection.strength,
        reverse ?? connection.strength
      )
      connection.strength = Math.min(1, updatedStrength)
    })

    // Filter nodes
    let filtered = newNodes.filter(node => {
      const matchesSearch = searchQuery === '' ||
        node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      
      const matchesType = nodeTypeFilter === 'all' || node.type === nodeTypeFilter
      
      return matchesSearch && matchesType
    })

    // Limit nodes for performance
    if (filtered.length > maxNodes[0]) {
      // Prioritize by connection count and timestamp
      filtered = filtered
        .sort((a, b) => {
          const aConnections = a.connections.length
          const bConnections = b.connections.length
          if (aConnections !== bConnections) return bConnections - aConnections
          
          const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0
          const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0
          return bTime - aTime
        })
        .slice(0, maxNodes[0])
    }

    // Filter connections to only include nodes that are in filtered set
    const filteredNodeIds = new Set(filtered.map(n => n.id))
    const filteredConns = newConnections.filter(conn => 
      filteredNodeIds.has(conn.source) && filteredNodeIds.has(conn.target)
    )

    return { 
      filteredNodes: filtered, 
      filteredConnections: filteredConns 
    }
  }, [knowledgeBase, derivationHistory, goals, searchQuery, nodeTypeFilter, maxNodes])

  useEffect(() => {
    setNodes(filteredNodes)
    setConnections(filteredConnections)
  }, [filteredNodes, filteredConnections])

  useEffect(() => {
    if (!selectedNode) return
    const updated = filteredNodes.find(node => node.id === selectedNode.id)
    if (!updated) {
      setSelectedNode(null)
      return
    }
    if (updated !== selectedNode) {
      setSelectedNode(updated)
    }
  }, [filteredNodes, selectedNode])

  // Initialize node positions
  useEffect(() => {
    if (nodeCount === 0) {
      return
    }

    const virtualWidth = 2000
    const virtualHeight = 1500

    setNodes(prevNodes => {
      let mutated = false
      const nextNodes = prevNodes.map(node => {
        if (node.x === undefined || node.y === undefined) {
          mutated = true
          return {
            ...node,
            x: Math.random() * (virtualWidth - 200) + 100,
            y: Math.random() * (virtualHeight - 200) + 100,
            vx: 0,
            vy: 0
          }
        }
        return node
      })

      return mutated ? nextNodes : prevNodes
    })
  }, [nodeCount])

  // Force simulation
  useEffect(() => {
    if (nodeCount === 0) return

    const simulate = () => {
      const alpha = 0.08  // Reduced for better stability
      const gravity = 0.005  // Reduced gravity
      const repulsion = 2000  // Increased repulsion
      const attraction = 0.05  // Reduced attraction

      setNodes(prevNodes => {
        const newNodes = [...prevNodes]
        const indexMap = new Map<string, number>()
        newNodes.forEach((node, index) => {
          indexMap.set(node.id, index)
        })
        
        // Apply forces
        for (let i = 0; i < newNodes.length; i++) {
          const node = newNodes[i]
          if (!node.x || !node.y) continue

          let fx = 0, fy = 0

          // Gentle gravity to center of virtual space
          const centerX = 1000
          const centerY = 750
          fx += (centerX - node.x) * gravity
          fy += (centerY - node.y) * gravity

          // Repulsion between nodes
          for (let j = 0; j < newNodes.length; j++) {
            if (i === j) continue
            const other = newNodes[j]
            if (!other.x || !other.y) continue

            const dx = node.x - other.x
            const dy = node.y - other.y
            const distance = Math.sqrt(dx * dx + dy * dy) || 1
            
            // Stronger repulsion for closer nodes
            const force = repulsion / (distance * distance)
            fx += (dx / distance) * force
            fy += (dy / distance) * force
          }

          // Attraction along connections
          node.connections.forEach(connection => {
            const connectedIndex = indexMap.get(connection.id)
            if (connectedIndex === undefined) return
            const connected = newNodes[connectedIndex]
            if (!connected?.x || !connected?.y || !node.x || !node.y) return

            const dx = connected.x - node.x
            const dy = connected.y - node.y
            const distance = Math.sqrt(dx * dx + dy * dy) || 1

            const strength = connection.strength ?? 0.4
            const relationshipBoost = connection.relationship === 'similar_to' ? 1.4 : 1
            const connectionForce = attraction * relationshipBoost * strength

            // Use spring-like force scaled by remaining distance
            fx += (dx / distance) * connectionForce * Math.min(distance / 250, 1)
            fy += (dy / distance) * connectionForce * Math.min(distance / 250, 1)
          })

          // Type-based attraction - similar nodes attract each other
          const typeAttraction = 0.02  // Weaker than connection attraction
          for (let j = 0; j < newNodes.length; j++) {
            if (i === j) continue
            const other = newNodes[j]
            if (!other.x || !other.y || other.type !== node.type) continue

            const dx = other.x - node.x
            const dy = other.y - node.y
            const distance = Math.sqrt(dx * dx + dy * dy) || 1
            
            // Only attract if they're reasonably close (within 300 pixels)
            if (distance < 300) {
              fx += (dx / distance) * typeAttraction * (300 - distance) / 300
              fy += (dy / distance) * typeAttraction * (300 - distance) / 300
            }
          }

          // Update velocity and position with damping
          node.vx = (node.vx || 0) * 0.85 + fx * alpha  // Increased damping
          node.vy = (node.vy || 0) * 0.85 + fy * alpha
          node.x += node.vx
          node.y += node.vy

          // Keep nodes in virtual bounds with padding
          const margin = (node.radius || 10) + 20
          node.x = Math.max(margin, Math.min(2000 - margin, node.x))
          node.y = Math.max(margin, Math.min(1500 - margin, node.y))
        }

        return newNodes
      })

      animationRef.current = requestAnimationFrame(simulate)
    }

    animationRef.current = requestAnimationFrame(simulate)
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [nodeCount])

  // Render graph
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match container
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Apply transformations (zoom and pan)
    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)

    // Draw connections
    connections.forEach(conn => {
      const sourceNode = nodes.find(n => n.id === conn.source)
      const targetNode = nodes.find(n => n.id === conn.target)

      if (sourceNode?.x && sourceNode?.y && targetNode?.x && targetNode?.y) {
        const strength = conn.strength ?? 0.3
        const alpha = Math.min(0.9, 0.25 + strength * 0.6)
        const width = (0.4 + strength * 1.6) / zoom
        const isSimilarity = conn.relationship === 'similar_to'

        ctx.strokeStyle = isSimilarity
          ? `rgba(59, 130, 246, ${alpha})`
          : `rgba(229, 231, 235, ${alpha})`
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.moveTo(sourceNode.x, sourceNode.y)
        ctx.lineTo(targetNode.x, targetNode.y)
        ctx.stroke()
      }
    })

    // Draw nodes
    nodes.forEach(node => {
      if (!node.x || !node.y) return

      const isSelected = selectedNode?.id === node.id
      const radius = (node.radius || 8) * (isSelected ? 1.5 : 1)

      // Node color based on type
      const colors = {
        goal: '#3b82f6',
        agent_response: '#10b981', 
        knowledge_entry: '#8b5cf6',
        concept: '#f59e0b'
      }

      ctx.fillStyle = colors[node.type]
      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
      ctx.fill()

      if (isSelected) {
        ctx.strokeStyle = '#1f2937'
        ctx.lineWidth = 3 / zoom
        ctx.stroke()
      }

      // Draw label for larger nodes or when zoomed in
      if (radius > 6 || zoom > 0.8 || isSelected) {
        ctx.fillStyle = '#1f2937'
        ctx.font = `${Math.max(10, radius) / zoom}px Inter`
        ctx.textAlign = 'center'
        const maxLength = Math.floor(radius * 2 * zoom)
        const label = node.label.length > maxLength ? 
          node.label.substring(0, maxLength) + '...' : 
          node.label
        ctx.fillText(label, node.x, node.y + radius + 15 / zoom)
      }
    })

    ctx.restore()
  }, [nodes, connections, selectedNode, zoom, panX, panY])

  // Handle canvas clicks
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || isDragging) return

    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left - panX) / zoom
    const y = (event.clientY - rect.top - panY) / zoom

    // Find clicked node
    for (const node of nodes) {
      if (!node.x || !node.y) continue
      
      const distance = Math.sqrt(
        Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2)
      )
      
      if (distance <= (node.radius || 8) + 5) {
        setSelectedNode(node)
        return
      }
    }
    
    setSelectedNode(null)
  }

  // Handle mouse down for panning
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true)
    setLastMousePos({ x: event.clientX, y: event.clientY })
  }

  // Handle mouse move for panning
  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return

    const deltaX = event.clientX - lastMousePos.x
    const deltaY = event.clientY - lastMousePos.y

    setPanX(panX + deltaX)
    setPanY(panY + deltaY)
    setLastMousePos({ x: event.clientX, y: event.clientY })
  }

  // Handle mouse up
  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Handle wheel for zooming
  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top

    // Calculate zoom
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(3, zoom * zoomFactor))

    // Adjust pan to zoom toward mouse position
    const zoomChange = newZoom / zoom
    setPanX(mouseX - (mouseX - panX) * zoomChange)
    setPanY(mouseY - (mouseY - panY) * zoomChange)
    setZoom(newZoom)
  }

  // Reset view
  const resetView = () => {
    setZoom(0.5)
    setPanX(0)
    setPanY(0)
    setSelectedNode(null)
  }

  const getNodeTypeColor = (type: string) => {
    const colors = {
      goal: 'bg-blue-500',
      agent_response: 'bg-green-500',
      knowledge_entry: 'bg-purple-500',
      concept: 'bg-yellow-500'
    }
    return colors[type as keyof typeof colors] || 'bg-gray-500'
  }

  const getNodeTypeLabel = (type: string) => {
    const labels = {
      goal: 'Goal',
      agent_response: 'Agent Response',
      knowledge_entry: 'Knowledge Entry',
      concept: 'Concept'
    }
    return labels[type as keyof typeof labels] || type
  }

  const formatRelationship = (relationship: GraphConnection['relationship']) => {
    const labels = {
      derives_from: 'Derives From',
      references: 'References',
      builds_on: 'Builds On',
      contradicts: 'Contradicts',
      contains_concept: 'Contains Concept',
      similar_to: 'Similarity'
    }
    return labels[relationship] || 'Linked'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Network className="h-6 w-6" />
            Knowledge Graph
          </h2>
          <p className="text-muted-foreground">
            {nodes.length} nodes • {connections.length} connections
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="flex items-center gap-2">
          <MagnifyingGlass className="h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="text-sm"
          />
        </div>
        
        <Select value={nodeTypeFilter} onValueChange={setNodeTypeFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="goal">Goals</SelectItem>
            <SelectItem value="agent_response">Agent Responses</SelectItem>
            <SelectItem value="knowledge_entry">Knowledge Entries</SelectItem>
            <SelectItem value="concept">Concepts</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Max Nodes:</span>
          <Slider
            value={maxNodes}
            onValueChange={setMaxNodes}
            max={500}
            min={10}
            step={10}
            className="flex-1"
          />
          <span className="text-sm w-8">{maxNodes[0]}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(Math.max(0.1, zoom - 0.2))}
          >
            <ArrowsIn className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(Math.min(3, zoom + 0.2))}
          >
            <ArrowsOut className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={resetView}
            title="Reset view"
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Graph Visualization - Much Larger */}
        <div className="lg:col-span-3">
          <Card className="h-[800px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Interactive Graph Visualization
                <span className="text-sm text-muted-foreground ml-auto">
                  Drag to pan • Scroll to zoom • Click nodes for details
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[720px]">
              <canvas 
                ref={canvasRef}
                onClick={handleCanvasClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                className={`w-full h-full ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              />
            </CardContent>
          </Card>
        </div>

        {/* Node Details and Legend */}
        <div className="space-y-4">
          {/* Legend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Node Types</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {['goal', 'agent_response', 'knowledge_entry', 'concept'].map(type => (
                <div key={type} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getNodeTypeColor(type)}`} />
                  <span className="text-sm">{getNodeTypeLabel(type)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Node Details */}
          {selectedNode ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge className={getNodeTypeColor(selectedNode.type)}>
                    {getNodeTypeLabel(selectedNode.type)}
                  </Badge>
                  <span className="text-sm">{selectedNode.label}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedNode.content && (
                  <div>
                    <p className="text-sm font-medium mb-2">Content</p>
                    <ScrollArea className="max-h-32">
                      <p className="text-sm text-muted-foreground">
                        {selectedNode.content.substring(0, 200)}
                        {selectedNode.content.length > 200 && '...'}
                      </p>
                    </ScrollArea>
                  </div>
                )}
                
                {selectedNode.tags && selectedNode.tags.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Tags/Concepts</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedNode.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium mb-2">Connections</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedNode.connections.length} connected nodes
                  </p>
                  {prominentConnections.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {prominentConnections.map(connection => (
                        <div
                          key={connection.id}
                          className="flex flex-col rounded-md border border-muted/40 px-2 py-1"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs font-medium">
                            <span className="truncate">
                              {getNodeTypeLabel(connection.type)} · {connection.label}
                            </span>
                            <span className="text-muted-foreground">
                              {(connection.strength * 100).toFixed(0)}%
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatRelationship(connection.relationship)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedNode.timestamp && (
                  <div>
                    <p className="text-sm font-medium mb-2">Created</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(selectedNode.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Link className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Click on a node to view details
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}