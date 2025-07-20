/**
 * Node Palette Component for Pipeline Designer
 * Provides drag-and-drop node types
 */

import React from 'react';
import { Play, Terminal, FileText, Container, TestTube, Rocket, Square, GitBranch, Zap } from 'lucide-react';

interface NodePaletteProps {
  className?: string;
}

const nodeTypes = [
  {
    type: 'start',
    label: 'Start',
    icon: Play,
    color: '#10b981',
    description: 'Pipeline trigger (manual, webhook, schedule)'
  },
  {
    type: 'command',
    label: 'Command',
    icon: Terminal,
    color: '#6b7280',
    description: 'Execute shell commands'
  },
  {
    type: 'script',
    label: 'Script',
    icon: FileText,
    color: '#7c3aed',
    description: 'Run scripts (bash, python, node)'
  },
  {
    type: 'docker',
    label: 'Docker',
    icon: Container,
    color: '#0ea5e9',
    description: 'Run Docker containers'
  },
  {
    type: 'test',
    label: 'Test',
    icon: TestTube,
    color: '#8b5cf6',
    description: 'Execute tests and collect results'
  },
  {
    type: 'deploy',
    label: 'Deploy',
    icon: Rocket,
    color: '#ec4899',
    description: 'Deploy to environments'
  },
  {
    type: 'conditional',
    label: 'Condition',
    icon: GitBranch,
    color: '#f59e0b',
    description: 'Conditional branching logic'
  },
  {
    type: 'parallel',
    label: 'Parallel',
    icon: Zap,
    color: '#8b5cf6',
    description: 'Execute branches in parallel'
  },
  {
    type: 'end',
    label: 'End',
    icon: Square,
    color: '#6b7280',
    description: 'Pipeline completion'
  }
];

export const NodePalette: React.FC<NodePaletteProps> = ({ className = '' }) => {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className={`node-palette ${className}`} style={{ padding: '16px' }}>
      <h3 style={{ 
        margin: '0 0 16px 0', 
        fontSize: '16px', 
        fontWeight: '600', 
        color: '#1f2937' 
      }}>
        Pipeline Nodes
      </h3>
      
      <div className="node-categories">
        <div className="category">
          <h4 style={{ 
            margin: '0 0 8px 0', 
            fontSize: '12px', 
            fontWeight: '600', 
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Control Flow
          </h4>
          
          {nodeTypes.filter(node => ['start', 'conditional', 'parallel', 'end'].includes(node.type)).map((nodeType) => {
            const Icon = nodeType.icon;
            return (
              <div
                key={nodeType.type}
                className="palette-node"
                draggable
                onDragStart={(event) => onDragStart(event, nodeType.type)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  marginBottom: '4px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  cursor: 'grab',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                  e.currentTarget.style.borderColor = nodeType.color;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    backgroundColor: nodeType.color,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '8px'
                  }}
                >
                  <Icon size={12} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontSize: '14px', 
                    fontWeight: '500', 
                    color: '#1f2937' 
                  }}>
                    {nodeType.label}
                  </div>
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#6b7280',
                    lineHeight: '1.3'
                  }}>
                    {nodeType.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="category" style={{ marginTop: '16px' }}>
          <h4 style={{ 
            margin: '0 0 8px 0', 
            fontSize: '12px', 
            fontWeight: '600', 
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Build & Test
          </h4>
          
          {nodeTypes.filter(node => ['command', 'script', 'docker', 'test'].includes(node.type)).map((nodeType) => {
            const Icon = nodeType.icon;
            return (
              <div
                key={nodeType.type}
                className="palette-node"
                draggable
                onDragStart={(event) => onDragStart(event, nodeType.type)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  marginBottom: '4px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  cursor: 'grab',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                  e.currentTarget.style.borderColor = nodeType.color;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    backgroundColor: nodeType.color,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '8px'
                  }}
                >
                  <Icon size={12} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontSize: '14px', 
                    fontWeight: '500', 
                    color: '#1f2937' 
                  }}>
                    {nodeType.label}
                  </div>
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#6b7280',
                    lineHeight: '1.3'
                  }}>
                    {nodeType.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="category" style={{ marginTop: '16px' }}>
          <h4 style={{ 
            margin: '0 0 8px 0', 
            fontSize: '12px', 
            fontWeight: '600', 
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Deploy
          </h4>
          
          {nodeTypes.filter(node => ['deploy'].includes(node.type)).map((nodeType) => {
            const Icon = nodeType.icon;
            return (
              <div
                key={nodeType.type}
                className="palette-node"
                draggable
                onDragStart={(event) => onDragStart(event, nodeType.type)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  marginBottom: '4px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  cursor: 'grab',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                  e.currentTarget.style.borderColor = nodeType.color;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    backgroundColor: nodeType.color,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '8px'
                  }}
                >
                  <Icon size={12} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontSize: '14px', 
                    fontWeight: '500', 
                    color: '#1f2937' 
                  }}>
                    {nodeType.label}
                  </div>
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#6b7280',
                    lineHeight: '1.3'
                  }}>
                    {nodeType.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ 
        marginTop: '16px', 
        padding: '8px', 
        backgroundColor: '#f0f9ff', 
        border: '1px solid #bae6fd',
        borderRadius: '6px',
        fontSize: '11px',
        color: '#0369a1'
      }}>
        💡 <strong>Tip:</strong> Drag nodes from this palette onto the canvas to build your pipeline.
      </div>
    </div>
  );
};