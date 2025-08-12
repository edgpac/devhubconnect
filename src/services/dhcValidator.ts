// src/services/dhcValidator.ts

export interface DHCVerification {
  source: string;
  purchaseId: string;
  userId: string;
  templateId: string;
  timestamp: string;
  version: string;
  signature: string;
}

export interface ValidatedTemplate {
  _dhc_verified: DHCVerification;
  workflow: any;
}

export interface N8NTemplate {
  meta: {
    instanceId: string;
  };
  name: string;
  nodes: any[];
  connections: any;
  tags?: string[];
  settings?: any;
  staticData?: any;
  pinData?: any;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  action?: string;
  purchaseId?: string;
  templateId?: string;
  workflow?: any;
  format?: 'dhc' | 'n8n';
}

class DHCTemplateValidator {
  private apiEndpoint: string;

  constructor(apiEndpoint: string = '/api/admin/verify-dhc-template') {
    this.apiEndpoint = apiEndpoint;
  }
  
  async validateTemplate(jsonData: any): Promise<ValidationResult> {
    // Check if it's DHC verified format
    if (this.isDHCFormat(jsonData)) {
      return this.validateDHCFormat(jsonData);
    }
    
    // Check if it's standard n8n format
    if (this.isN8NFormat(jsonData)) {
      return this.validateN8NFormat(jsonData);
    }
    
    return {
      valid: false,
      error: "Template format not recognized",
      action: "Please upload either a DevHubConnect verified template or a standard n8n template with 'devhubconnect' tag"
    };
  }
  
  private isDHCFormat(jsonData: any): boolean {
    return jsonData._dhc_verified && jsonData.workflow;
  }
  
  private isN8NFormat(jsonData: any): boolean {
    return jsonData.meta && jsonData.name && jsonData.nodes && jsonData.connections;
  }
  
  private async validateDHCFormat(jsonData: any): Promise<ValidationResult> {
    const verification: DHCVerification = jsonData._dhc_verified;
    
    // Step 2: Basic structure validation
    if (!verification.source || verification.source !== "DevHubConnect.com") {
      return {
        valid: false,
        error: "Invalid template source",
        action: "Only DevHubConnect.com templates are supported"
      };
    }
    
    if (!verification.signature || !verification.purchaseId) {
      return {
        valid: false,
        error: "Template verification data is incomplete",
        action: "Please re-download the template from DevHubConnect.com"
      };
    }
    
    // Step 3: Server-side verification
    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          verification: verification,
          workflowHash: this.hashWorkflow(jsonData.workflow)
        })
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.valid) {
        return {
          valid: false,
          error: result.error || "Template verification failed",
          action: "Please ensure you downloaded this template from DevHubConnect.com"
        };
      }
      
      return {
        valid: true,
        purchaseId: verification.purchaseId,
        templateId: verification.templateId,
        workflow: jsonData.workflow,
        format: 'dhc'
      };
      
    } catch (error) {
      return {
        valid: false,
        error: "Unable to verify template authenticity",
        action: "Please check your internet connection and try again"
      };
    }
  }
  
  private validateN8NFormat(jsonData: N8NTemplate): ValidationResult {
    // Check for required fields
    if (!jsonData.meta?.instanceId) {
      return {
        valid: false,
        error: "Missing meta.instanceId",
        action: "Standard n8n templates must include meta.instanceId field"
      };
    }
    
    if (!jsonData.name?.trim()) {
      return {
        valid: false,
        error: "Missing template name",
        action: "Template must have a valid name"
      };
    }
    
    // Check for DevHubConnect tag
    if (!jsonData.tags?.includes('devhubconnect')) {
      return {
        valid: false,
        error: "Template must include 'devhubconnect' tag",
        action: "Add 'devhubconnect' to the tags array to use this template"
      };
    }
    
    // Validate workflow content
    const workflowValidation = this.validateWorkflowContent(jsonData);
    if (!workflowValidation.valid) {
      return workflowValidation;
    }
    
    // Generate template ID for n8n format
    const templateId = `n8n_${jsonData.meta.instanceId}`;
    
    return {
      valid: true,
      templateId: templateId,
      workflow: jsonData,
      format: 'n8n'
    };
  }
  
  private validateWorkflowContent(workflow: any): ValidationResult {
    // Validate nodes
    if (!Array.isArray(workflow.nodes) || workflow.nodes.length < 3) {
      return {
        valid: false,
        error: "Template must have at least 3 nodes",
        action: "Create a workflow with at least 3 connected nodes"
      };
    }
    
    // Validate connections
    if (!workflow.connections || typeof workflow.connections !== 'object') {
      return {
        valid: false,
        error: "Template must have connections object",
        action: "Ensure your workflow has proper node connections"
      };
    }
    
    // Check for basic node structure
    const invalidNodes = workflow.nodes.filter((node: any) => 
      !node.id || !node.name || !node.type || !node.position
    );
    
    if (invalidNodes.length > 0) {
      return {
        valid: false,
        error: "Some nodes are missing required properties",
        action: "All nodes must have id, name, type, and position properties"
      };
    }
    
    return { valid: true };
  }
  
  private hashWorkflow(workflow: any): string {
    // Simple hash function for client-side
    return btoa(JSON.stringify(workflow)).slice(0, 32);
  }
  
  async handleFileUpload(file: File): Promise<ValidationResult> {
    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      
      const validation = await this.validateTemplate(jsonData);
      
      if (!validation.valid) {
        throw new Error(validation.error + ". " + validation.action);
      }
      
      return validation;
      
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("Invalid JSON file. Please upload a valid DevHubConnect template or n8n workflow.");
      }
      throw error;
    }
  }
}

export default DHCTemplateValidator;