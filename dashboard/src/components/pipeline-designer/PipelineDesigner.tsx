/**
 * Pipeline Visual Designer Component
 * Drag-and-drop pipeline builder with node-based interface
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  useReactFlow,
  Node,
  Edge,
  Connection,
  NodeTypes,
  EdgeTypes,
  MarkerType,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';

// Import custom node types
import { StartNode } from './nodes/StartNode';
import { CommandNode } from './nodes/CommandNode';
import { ScriptNode } from './nodes/ScriptNode';
import { DockerNode } from './nodes/DockerNode';
import { TestNode } from './nodes/TestNode';
import { DeployNode } from './nodes/DeployNode';
import { EndNode } from './nodes/EndNode';
import { ConditionalNode } from './nodes/ConditionalNode';
import { ParallelNode } from './nodes/ParallelNode';

// Import custom edge types
import { CustomEdge } from './edges/CustomEdge';

// Import designer panels
import { NodePalette } from './panels/NodePalette';
import { PropertyPanel } from './panels/PropertyPanel';
import { ValidationPanel } from './panels/ValidationPanel';
import { ToolbarPanel } from './panels/ToolbarPanel';

// Import types
import { PipelineNode, PipelineConfig, ValidationResult } from '../../types/pipeline';

// Define node types
const nodeTypes: NodeTypes = {
  start: StartNode,
  command: CommandNode,
  script: ScriptNode,
  docker: DockerNode,
  test: TestNode,
  deploy: DeployNode,
  end: EndNode,
  conditional: ConditionalNode,
  parallel: ParallelNode,
};

// Define edge types
const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

// Default edge options
const defaultEdgeOptions = {
  type: 'custom',
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { strokeWidth: 2 },
};

interface PipelineDesignerProps {
  initialPipeline?: PipelineConfig;
  onPipelineChange?: (pipeline: PipelineConfig) => void;
  onValidationChange?: (validation: ValidationResult) => void;
  readOnly?: boolean;
  className?: string;
}

export const PipelineDesigner: React.FC<PipelineDesignerProps> = ({
  initialPipeline,
  onPipelineChange,
  onValidationChange,
  readOnly = false,
  className = ''
}) => {
  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Designer state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [autoLayout, setAutoLayout] = useState(false);

  // Pipeline state
  const [pipelineName, setPipelineName] = useState('');
  const [pipelineDescription, setPipelineDescription] = useState('');

  // Initialize with pipeline data
  useEffect(() => {
    if (initialPipeline) {
      setPipelineName(initialPipeline.name || '');
      setPipelineDescription(initialPipeline.description || '');
      
      // Convert pipeline nodes to React Flow nodes
      const flowNodes = convertPipelineNodesToFlowNodes(initialPipeline.nodes || []);
      const flowEdges = convertPipelineEdgesToFlowEdges(initialPipeline.edges || []);
      
      setNodes(flowNodes);
      setEdges(flowEdges);
    }
  }, [initialPipeline, setNodes, setEdges]);

  // Handle connection between nodes
  const onConnect = useCallback(
    (params: Connection) => {
      if (readOnly) return;
      
      const newEdge = {
        ...params,
        id: `edge-${params.source}-${params.target}`,
        type: 'custom',
        markerEnd: { type: MarkerType.ArrowClosed },
      };
      
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges, readOnly]
  );

  // Handle node selection
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (!readOnly) {
        setSelectedNode(node);
      }
    },
    [readOnly]
  );

  // Handle node drag
  const onNodeDrag = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setIsDragging(true);
    },
    []
  );

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setIsDragging(false);
    },
    []
  );

  // Handle drop from palette
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      if (readOnly) return;
      
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const nodeType = event.dataTransfer.getData('application/reactflow');

      if (nodeType === undefined || !nodeType || !reactFlowBounds || !reactFlowInstance) {
        return;
      }

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNodeId = `node-${Date.now()}`;
      const newNode: Node = {
        id: newNodeId,
        type: nodeType,
        position,
        data: {
          label: `${nodeType} Node`,
          ...getDefaultNodeData(nodeType)
        },
      };

      setNodes((nds) => nds.concat(newNode));
      setSelectedNode(newNode);
    },
    [reactFlowInstance, setNodes, readOnly]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Update node data
  const updateNodeData = useCallback(
    (nodeId: string, newData: any) => {
      if (readOnly) return;
      
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node
        )
      );
    },
    [setNodes, readOnly]
  );

  // Delete selected node
  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode || readOnly) return;
    
    setNodes((nds) => nds.filter((node) => node.id !== selectedNode.id));
    setEdges((eds) => eds.filter((edge) => 
      edge.source !== selectedNode.id && edge.target !== selectedNode.id
    ));
    setSelectedNode(null);
  }, [selectedNode, setNodes, setEdges, readOnly]);

  // Validate pipeline
  const validatePipeline = useCallback(async () => {
    const pipelineConfig = convertFlowToPipelineConfig();
    
    try {
      const response = await fetch('/api/v2/pipelines/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pipelineConfig),
      });
      
      const validationResult = await response.json();
      setValidation(validationResult);
      onValidationChange?.(validationResult);
    } catch (error) {
      console.error('Validation error:', error);
      const errorResult: ValidationResult = {
        isValid: false,
        errors: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
        info: []
      };
      setValidation(errorResult);
      onValidationChange?.(errorResult);
    }
  }, [nodes, edges, pipelineName, pipelineDescription, onValidationChange]);

  // Convert flow to pipeline configuration
  const convertFlowToPipelineConfig = useCallback((): PipelineConfig => {
    const pipelineNodes: PipelineNode[] = nodes.map((node) => ({
      id: node.id,
      name: node.data.label || node.id,
      type: node.type || 'command',
      position: node.position,
      config: node.data,
      dependencies: edges
        .filter((edge) => edge.target === node.id)
        .map((edge) => edge.source),
    }));

    return {
      name: pipelineName,
      description: pipelineDescription,
      nodes: pipelineNodes,
      edges: edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type || 'default'
      })),
      config: {
        autoLayout,
        showGrid,
        showMiniMap,
      },
    };
  }, [nodes, edges, pipelineName, pipelineDescription, autoLayout, showGrid, showMiniMap]);

  // Export pipeline configuration
  const exportPipeline = useCallback(() => {
    const pipelineConfig = convertFlowToPipelineConfig();
    onPipelineChange?.(pipelineConfig);
    return pipelineConfig;
  }, [convertFlowToPipelineConfig, onPipelineChange]);

  // Auto-layout pipeline
  const autoLayoutPipeline = useCallback(async () => {
    if (!reactFlowInstance) return;
    
    try {
      // Simple auto-layout using hierarchical positioning
      const layoutedNodes = nodes.map((node, index) => ({
        ...node,
        position: {
          x: (index % 4) * 250,
          y: Math.floor(index / 4) * 150,
        },
      }));
      
      setNodes(layoutedNodes);
      
      // Fit view after layout
      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.1 });
      }, 100);
    } catch (error) {
      console.error('Auto-layout error:', error);
    }
  }, [reactFlowInstance, nodes, setNodes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (readOnly) return;
      
      if (event.key === 'Delete' && selectedNode) {
        deleteSelectedNode();
      } else if (event.ctrlKey || event.metaKey) {
        if (event.key === 's') {
          event.preventDefault();
          exportPipeline();
        } else if (event.key === 'l') {
          event.preventDefault();
          autoLayoutPipeline();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, deleteSelectedNode, exportPipeline, autoLayoutPipeline, readOnly]);

  // Validate on changes
  useEffect(() => {
    if (nodes.length > 0) {
      const debounceTimeout = setTimeout(validatePipeline, 500);
      return () => clearTimeout(debounceTimeout);
    }
  }, [nodes, edges, validatePipeline]);

  return (
    <div className={`pipeline-designer ${className}`} style={{ height: '100%' }}>
      <ReactFlowProvider>
        <div className="designer-layout" style={{ display: 'flex', height: '100%' }}>
          {/* Node Palette */}
          {!readOnly && (
            <div className="palette-panel" style={{ width: '250px', borderRight: '1px solid #e2e8f0' }}>
              <NodePalette />
            </div>
          )}

          {/* Main Canvas */}
          <div className="canvas-container" style={{ flex: 1, position: 'relative' }}>
            <div
              className="reactflow-wrapper"
              ref={reactFlowWrapper}
              style={{ width: '100%', height: '100%' }}
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={setReactFlowInstance}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={onNodeClick}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={defaultEdgeOptions}
                snapToGrid={true}
                snapGrid={[15, 15]}
                attributionPosition="top-right"
                proOptions={{ hideAttribution: true }}
                deleteKeyCode={readOnly ? null : 'Delete'}
              >
                <Controls />
                {showMiniMap && <MiniMap />}
                {showGrid && <Background />}
                
                {/* Toolbar Panel */}
                <Panel position="top-left">
                  <ToolbarPanel
                    onExport={exportPipeline}
                    onAutoLayout={autoLayoutPipeline}
                    onValidate={validatePipeline}
                    showGrid={showGrid}
                    onToggleGrid={() => setShowGrid(!showGrid)}
                    showMiniMap={showMiniMap}
                    onToggleMiniMap={() => setShowMiniMap(!showMiniMap)}
                    readOnly={readOnly}
                  />
                </Panel>

                {/* Validation Panel */}
                {validation && (
                  <Panel position="top-right">
                    <ValidationPanel
                      validation={validation}
                      onClose={() => setValidation(null)}
                    />
                  </Panel>
                )}
              </ReactFlow>
            </div>
          </div>

          {/* Property Panel */}
          {!readOnly && selectedNode && (
            <div className="property-panel" style={{ width: '300px', borderLeft: '1px solid #e2e8f0' }}>
              <PropertyPanel
                node={selectedNode}
                onNodeUpdate={updateNodeData}
                onNodeDelete={deleteSelectedNode}
              />
            </div>
          )}
        </div>
      </ReactFlowProvider>
    </div>
  );
};

// Helper functions
function convertPipelineNodesToFlowNodes(pipelineNodes: PipelineNode[]): Node[] {
  return pipelineNodes.map((pNode) => ({
    id: pNode.id,
    type: pNode.type,
    position: pNode.position || { x: 0, y: 0 },
    data: {
      label: pNode.name,
      ...pNode.config,
    },
  }));
}

function convertPipelineEdgesToFlowEdges(pipelineEdges: any[]): Edge[] {
  return pipelineEdges.map((pEdge) => ({
    id: pEdge.id,
    source: pEdge.source,
    target: pEdge.target,
    type: pEdge.type || 'custom',
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
}

function getDefaultNodeData(nodeType: string): any {
  const defaults = {
    start: { label: 'Start', trigger: 'manual' },
    command: { label: 'Command', command: 'echo "Hello World"' },
    script: { label: 'Script', script: '#!/bin/bash\necho "Hello World"', scriptType: 'bash' },
    docker: { label: 'Docker', image: 'ubuntu:latest', command: 'echo "Hello World"' },
    test: { label: 'Test', testCommand: 'npm test', framework: 'jest' },
    deploy: { label: 'Deploy', deployType: 'custom', target: 'production' },
    end: { label: 'End', action: 'complete' },
    conditional: { label: 'Condition', condition: 'success', trueLabel: 'True', falseLabel: 'False' },
    parallel: { label: 'Parallel', branches: ['branch1', 'branch2'] },
  };

  return (defaults as any)[nodeType] || { label: 'Node' };
}