import { WorkflowNode, WorkflowConnection } from "@/types/workflow";
import { Card } from "@/components/ui/card";

interface WorkflowViewerProps {
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
}

const getNodeIcon = (type: string) => {
  const icons: Record<string, string> = {
    trigger: "▶️",
    webhook: "🔗",
    http: "🌐",
    database: "🗄️",
    email: "📧",
    slack: "💬",
    function: "⚙️",
    if: "🔀",
    switch: "🎯",
    merge: "🔗",
    set: "📝",
    transform: "🔄",
  };
  return icons[type.toLowerCase()] || "⚙️";
};

const getNodeColor = (type: string) => {
  const colors: Record<string, string> = {
    trigger: "bg-green-100 border-green-300",
    webhook: "bg-blue-100 border-blue-300",
    http: "bg-purple-100 border-purple-300",
    database: "bg-orange-100 border-orange-300",
    email: "bg-red-100 border-red-300",
    slack: "bg-yellow-100 border-yellow-300",
    function: "bg-gray-100 border-gray-300",
    if: "bg-cyan-100 border-cyan-300",
    switch: "bg-pink-100 border-pink-300",
    merge: "bg-indigo-100 border-indigo-300",
    set: "bg-teal-100 border-teal-300",
    transform: "bg-lime-100 border-lime-300",
  };
  return colors[type.toLowerCase()] || "bg-gray-100 border-gray-300";
};

export const WorkflowViewer = ({ nodes, connections }: WorkflowViewerProps) => {
  // Calculate layout positions for nodes
  const layoutNodes = nodes.map((node, index) => ({
    ...node,
    position: node.position || { 
      x: (index % 3) * 200 + 100, 
      y: Math.floor(index / 3) * 120 + 50 
    }
  }));

  return (
    <div className="relative w-full h-96 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden">
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 1 }}>
        {connections.map((connection, index) => {
          const sourceNode = layoutNodes.find(n => n.id === connection.source);
          const targetNode = layoutNodes.find(n => n.id === connection.target);
          
          if (!sourceNode || !targetNode) return null;
          
          const x1 = sourceNode.position.x + 80;
          const y1 = sourceNode.position.y + 25;
          const x2 = targetNode.position.x + 80;
          const y2 = targetNode.position.y + 25;
          
          return (
            <g key={index}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#3b82f6"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            </g>
          );
        })}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="#3b82f6"
            />
          </marker>
        </defs>
      </svg>
      
      {layoutNodes.map((node) => (
        <div
          key={node.id}
          className="absolute"
          style={{
            left: node.position.x,
            top: node.position.y,
            zIndex: 2,
          }}
        >
          <Card className={`p-3 w-40 text-center shadow-md hover:shadow-lg transition-shadow ${getNodeColor(node.type)}`}>
            <div className="text-lg mb-1">{getNodeIcon(node.type)}</div>
            <div className="text-xs font-semibold text-gray-700 truncate">{node.name}</div>
            <div className="text-xs text-gray-500 mt-1 capitalize">{node.type}</div>
          </Card>
        </div>
      ))}
    </div>
  );
};
