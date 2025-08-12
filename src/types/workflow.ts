export interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  data?: any;
}

export interface WorkflowConnection {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  price: number;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  settings?: any;
  appIcons?: string[];
  createdAt: string;
  purchased?: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  purchasedTemplates?: string[];
}

export interface Purchase {
  id: string;
  userId: string;
  templateId: string;
  amount: number;
  purchaseDate: string;
  stripeSessionId?: string;
}
