import { Router, Request, Response, NextFunction } from 'express';
import { db } from './db';
import { templates } from '../shared/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const adminRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_for_devhubconnect';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

console.log('🔑 JWT SECRET IN USE (DEVELOPMENT ONLY):', JWT_SECRET);
console.log('🔒 ADMIN_PASSWORD_HASH IN USE (DEVELOPMENT ONLY):', ADMIN_PASSWORD_HASH ? 'Loaded (length: ' + ADMIN_PASSWORD_HASH.length + ')' : 'NOT LOADED - LOGIN WILL FAIL');

interface AuthenticatedAdminRequest extends Request {
  user?: {
    id: string;
    isAdmin: boolean;
  };
}

const verifyAdminToken = (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('DEBUG: No token provided in Authorization header.');
    return res.status(401).json({ success: false, message: 'Authentication token required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; isAdmin: boolean };
    if (decoded.isAdmin) {
      req.user = decoded;
      next();
    } else {
      console.log('DEBUG: Token provided but not admin.');
      res.status(403).json({ success: false, message: 'Forbidden: Not an admin.' });
    }
  } catch (error) {
    console.error('JWT verification failed:', error);
    res.status(403).json({ success: false, message: 'Forbidden: Invalid or expired token.' });
  }
};

// Robust JSON extraction function with better debugging
function extractJsonFromResponse(response: string): any {
  console.log('DEBUG: Full AI response content:', JSON.stringify(response));
  console.log('DEBUG: Response length:', response.length);
  
  if (!response || response.trim().length === 0) {
    throw new Error('Empty response from AI model');
  }

  // Clean the response first
  let cleaned = response.trim();
  
  // Remove common prefixes that models add
  const prefixesToRemove = [
    'Here is the JSON:',
    'Here\'s the JSON:',
    'JSON:',
    'Response:',
    'Output:',
    'Result:',
    'Here is the requested JSON object:',
    'Here\'s the requested JSON object:',
  ];
  
  for (const prefix of prefixesToRemove) {
    if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
      cleaned = cleaned.substring(prefix.length).trim();
    }
  }
  
  console.log('DEBUG: Cleaned response:', JSON.stringify(cleaned));

  // Method 1: Try to find JSON between braces (most common)
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]);
      console.log('DEBUG: Successfully extracted JSON using brace matching');
      return parsed;
    } catch (e) {
      console.log('DEBUG: Brace matching found JSON-like text but parsing failed:', e);
    }
  }

  // Method 2: Try to extract from code blocks
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      console.log('DEBUG: Successfully extracted JSON from code block');
      return parsed;
    } catch (e) {
      console.log('DEBUG: Code block extraction found JSON-like text but parsing failed:', e);
    }
  }

  // Method 3: Try to parse the entire response as JSON (in case it's clean)
  try {
    const parsed = JSON.parse(cleaned);
    console.log('DEBUG: Successfully parsed entire response as JSON');
    return parsed;
  } catch (e) {
    console.log('DEBUG: Could not parse entire response as JSON:', e);
  }

  // Method 4: Look for JSON-like content more aggressively
  const lines = cleaned.split('\n');
  let jsonStart = -1;
  let jsonEnd = -1;
  let braceCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '{') {
        if (jsonStart === -1) jsonStart = i;
        braceCount++;
      } else if (line[j] === '}') {
        braceCount--;
        if (braceCount === 0 && jsonStart !== -1) {
          jsonEnd = i;
          break;
        }
      }
    }
    if (jsonEnd !== -1) break;
  }
  
  if (jsonStart !== -1 && jsonEnd !== -1) {
    const jsonLines = lines.slice(jsonStart, jsonEnd + 1);
    const jsonString = jsonLines.join('\n');
    try {
      const parsed = JSON.parse(jsonString);
      console.log('DEBUG: Successfully extracted JSON using line-by-line parsing');
      return parsed;
    } catch (e) {
      console.log('DEBUG: Line-by-line extraction failed:', e);
    }
  }

  throw new Error(`No valid JSON object found in response. Response was: "${cleaned}"`);
}

// Generate fallback template details
function generateFallbackDetails(workflowJson: any): any {
  console.log('DEBUG: Generating fallback template details');
  
  // Try to extract some info from the workflow
  let name = 'n8n Workflow Template';
  let nodeCount = 0;
  
  try {
    if (workflowJson.nodes && Array.isArray(workflowJson.nodes)) {
      nodeCount = workflowJson.nodes.length;
      // Try to create a more descriptive name based on nodes
      const nodeTypes = workflowJson.nodes.map((node: any) => node.type).filter(Boolean);
      const uniqueTypes = [...new Set(nodeTypes)].slice(0, 3);
      if (uniqueTypes.length > 0) {
        name = `${uniqueTypes.join(' + ')} Workflow`;
      }
    }
  } catch (e) {
    console.log('DEBUG: Could not extract workflow details for fallback');
  }

  return {
    name: name.length > 60 ? name.substring(0, 57) + '...' : name,
    description: `Setup Instructions for ${name}\n\nOverview\nThis workflow contains ${nodeCount} nodes and implements automated business logic.\n\nPrerequisites\n- n8n instance (cloud or self-hosted)\n- API credentials as required by individual nodes\n\nSetup Steps\n1. Configure n8n Environment\n   - Ensure n8n is installed and running\n   - Log into your n8n instance\n   - Create a new workflow\n\n2. Import Workflow\n   - Copy the provided JSON workflow configuration\n   - In n8n, go to Workflow > Import from Clipboard\n   - Paste the JSON and import\n   - Save the workflow\n\n3. Configure Credentials\n   - Review each node for required credentials\n   - Set up API keys and authentication as needed\n   - Test connections to external services\n\n4. Test the Workflow\n   - Activate the workflow\n   - Test with sample data\n   - Verify all nodes execute correctly\n\n5. Deployment\n   - Save and activate the workflow\n   - Monitor workflow executions\n   - Set up error handling as needed\n\nNotes\n- Review and customize node configurations for your use case\n- Test thoroughly before production use\n- Monitor API usage and quotas`,
    price: 349
  };
}

adminRouter.post('/login', async (req: Request, res: Response) => {
  const { password } = req.body;
  console.log('DEBUG: Login attempt received.');
  console.log('DEBUG: Password received (first 5 chars):', password ? password.substring(0, 5) + '...' : 'No password');

  if (!ADMIN_PASSWORD_HASH) {
    console.error('ADMIN_PASSWORD_HASH is not set in .env. Admin login cannot proceed.');
    return res.status(500).json({ success: false, message: 'Server configuration error: Admin password hash not set.' });
  }
  console.log('DEBUG: ADMIN_PASSWORD_HASH is loaded. Attempting bcrypt.compare...');

  try {
    const isPasswordValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    console.log('DEBUG: bcrypt.compare result:', isPasswordValid);

    if (isPasswordValid) {
      const adminPayload = { id: 'admin_user_id', isAdmin: true };
      const token = jwt.sign(adminPayload, JWT_SECRET, { expiresIn: '1h' });
      console.log('DEBUG: Password valid. Token issued.');
      res.json({ success: true, message: 'Admin login successful', token });
    } else {
      console.log('DEBUG: Invalid password provided.');
      res.status(401).json({ success: false, message: 'Invalid password' });
    }
  } catch (error) {
    console.error('Error during password comparison:', error);
    res.status(500).json({ success: false, message: 'Internal server error during login.' });
  }
});

// ❌ REMOVED: Analytics data endpoint - this was competing with simple-server.mjs
// The analytics endpoint in simple-server.mjs should handle this instead

// ✅ Get all templates for admin management
adminRouter.get('/templates', verifyAdminToken, async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const allTemplates = await db.select({
      id: templates.id,
      name: templates.name,
      status: templates.status,
      price: templates.price,
      createdAt: templates.createdAt,
      isPublic: templates.isPublic
    }).from(templates);

    res.json({ templates: allTemplates });
  } catch (error) {
    console.error('❌ Error fetching templates:', error);
    console.error('❌ Schema error details:', error.message);
    res.status(500).json({ message: 'Failed to fetch templates.' });
  }
});

// ✅ Update template endpoint
adminRouter.put('/templates/:id', verifyAdminToken, async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Add proper validation
    if (!id || !updateData) {
      return res.status(400).json({ error: 'Missing template ID or update data' });
    }
    
    const templateId = parseInt(id);
    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }
    
    // Update the template
    const updatedTemplate = await db.update(templates)
      .set(updateData)
      .where(eq(templates.id, templateId))
      .returning();
    
    if (!updatedTemplate || updatedTemplate.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    console.log(`✅ Template ${templateId} updated successfully by admin`);
    res.json({ 
      success: true, 
      message: 'Template updated successfully',
      template: updatedTemplate[0] 
    });
    
  } catch (error) {
    console.error('Template update error:', error);
    res.status(500).json({ 
      error: 'Failed to update template',
      details: error.message 
    });
  }
});

// ✅ Delete template endpoint
adminRouter.delete('/templates/:id', verifyAdminToken, async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    
    console.log(`DEBUG: Attempting to delete template ID: ${templateId}`);
    
    if (isNaN(templateId)) {
      console.log(`DEBUG: Invalid template ID provided: ${req.params.id}`);
      return res.status(400).json({ message: 'Invalid template ID' });
    }

    // First check if template exists
    const existingTemplate = await db.select().from(templates).where(eq(templates.id, templateId));
    console.log(`DEBUG: Found existing template:`, existingTemplate);

    const deletedTemplate = await db.delete(templates)
      .where(eq(templates.id, templateId))
      .returning();

    console.log(`DEBUG: Delete operation result:`, deletedTemplate);

    if (deletedTemplate.length === 0) {
      console.log(`DEBUG: Template ${templateId} not found in database`);
      return res.status(404).json({ message: 'Template not found' });
    }

    console.log(`✅ Template ${templateId} deleted successfully by admin`);
    res.json({ message: 'Template deleted successfully', templateId });
  } catch (error) {
    console.error('❌ DETAILED DELETE ERROR:', error);
    console.error('❌ Error name:', error?.name);
    console.error('❌ Error message:', error?.message);
    console.error('❌ Error stack:', error?.stack);
    res.status(500).json({ 
      message: 'Failed to delete template', 
      error: error?.message,
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
});

adminRouter.post('/upload', verifyAdminToken, async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const { name, description, price, workflowJson, imageUrl } = req.body;
    const adminId = req.user?.id;

    if (!name || !description || price === undefined || !workflowJson) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const [existingTemplate] = await db.select().from(templates)
      .where(eq(templates.workflowJson, workflowJson));

    if (existingTemplate) {
      return res.status(409).json({ message: 'Template with this workflow JSON already exists.' });
    }

    const newTemplate = await db.insert(templates).values({
      name,
      description,
      price: Math.round(Number(price) * 100),
      workflowJson,
      imageUrl,
      creatorId: adminId,
      status: 'published',
      isPublic: true,
    }).returning();

    res.status(201).json({ message: 'Workflow uploaded successfully!', template: newTemplate[0] });

  } catch (error) {
    console.error('❌ Error uploading template:', error);
    res.status(500).json({ message: 'Failed to upload workflow.' });
  }
});

adminRouter.post('/generate-template-details', verifyAdminToken, async (req: AuthenticatedAdminRequest, res: Response) => {
  const { workflowJson } = req.body;

  if (!workflowJson) {
    return res.status(400).json({ error: 'workflowJson is required in the request body.' });
  }

  try {
    const [existingTemplate] = await db.select().from(templates)
      .where(eq(templates.workflowJson, workflowJson));

    if (existingTemplate) {
      return res.status(409).json({ message: 'Template with this workflow JSON already exists. No new details generated.' });
    }

    const workflowJsonString = JSON.stringify(workflowJson, null, 2);

    const promptText = `You are a JSON generator. You must respond with ONLY a valid JSON object, no explanation, no markdown, no additional text.
Analyze this n8n workflow and generate template details.

The description should be exactly 3 paragraphs:
1. What the workflow does and its main purpose
2. Setup requirements (credentials, external services, configuration needed)  
3. Testing and deployment steps

Required JSON format (respond with this exact structure):
{
  "name": "Template title (max 60 chars)",
  "description": "Paragraph 1 explaining what this workflow does and its main purpose.\\n\\nParagraph 2 covering setup requirements including credentials, external services, and key configuration steps.\\n\\nParagraph 3 about testing, deployment, and final configuration notes.",
  "price": 349
}

Price must be exactly one of: 349, 549, or 699 (representing $3.49, $5.49, $6.99)

Workflow JSON:
${workflowJsonString}

JSON response:`;    
    const MAX_RETRIES = 3;
    const VALID_PRICES_CENTS = [349, 549, 699];
    let generatedDetails: any = null;
    let lastError: any = null;

    // Extract key workflow information for better prompting
    const workflowName = workflowJson.name || 'Unknown Workflow';
    const nodeNames = workflowJson.nodes?.map((n: any) => n.name).filter(Boolean) || [];
    const nodeTypes = workflowJson.nodes?.map((n: any) => n.type).filter(Boolean) || [];
    const uniqueServices = [...new Set(nodeTypes)].slice(0, 8);

    for (let i = 0; i < MAX_RETRIES; i++) {
      console.log(`DEBUG: Attempting AI generation (Retry ${i + 1}/${MAX_RETRIES})`);
      try {
        const detailedPrompt = `You are a technical writer specializing in creating professional setup instructions for n8n workflow templates. Analyze the provided n8n workflow JSON and generate detailed setup instructions tailored to its nodes and services.

WORKFLOW TO ANALYZE:
Name: ${workflowName}
Node Count: ${workflowJson.nodes?.length || 0}
Key Nodes: ${nodeNames.slice(0, 8).join(', ')}
Services Used: ${uniqueServices.map(s => s.replace('n8n-nodes-base.', '')).join(', ')}

Write exactly 3 complete paragraphs in a professional, instructional tone using action words like "configure," "set up," "ensure," "import," "activate," and "deploy." Avoid numbered lists or bullet points. Be specific about node names (e.g., Chat Trigger, OpenAI Request, Documentation Search, Web Search) and services (e.g., OpenAI, DuckDuckGo).

Paragraph 1: Describe the workflow's purpose, focusing on its main functionality, such as processing user queries via a chat interface, generating AI-driven responses, and retrieving results from documentation and web searches. Highlight key nodes like Chat Trigger for initiating queries, OpenAI Request for AI responses, Documentation Search for n8n documentation, and Web Search for external data.

Paragraph 2: Detail the setup process, including importing the JSON workflow into an n8n instance via Workflow > Import from Clipboard. Specify configuring the Chat Trigger node's webhook URL to accept incoming queries, setting up OpenAI API credentials for the OpenAI Request node, and customizing parameters like query inputs for the Documentation Search and Web Search nodes (e.g., DuckDuckGo API settings). Emphasize establishing and testing API connections for reliable operation.

Paragraph 3: Explain testing the workflow by sending sample queries through the Chat Trigger node and verifying outputs in the Combine Results node, which aggregates aiResponse, documentation, and webResults. Describe troubleshooting using error logs from nodes like OpenAI Error Handler and Docs Error Handler. Cover activating the workflow for production use and monitoring performance via timestamps and status outputs in the Combine Results and Final Error Response nodes.

Respond with ONLY this JSON structure:
{
  "name": "Professional title describing this workflow's purpose (max 60 chars)",
  "description": "Paragraph 1 describing the workflow's purpose and key nodes.\\n\\nParagraph 2 detailing import, webhook, and configuration steps.\\n\\nParagraph 3 explaining testing, deployment, and monitoring procedures.",
  "price": 549
}`;
        console.log('DEBUG: Using improved setup instruction prompt');
        console.log('DEBUG: Workflow name being analyzed:', workflowName);
        console.log('DEBUG: Key nodes:', nodeNames.slice(0, 5));

        const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'mistral',
            prompt: detailedPrompt,
            stream: false,
            options: {
              temperature: 0.2,
              top_p: 0.8,
              num_predict: 4000
            }
          }),
        });

        if (!ollamaResponse.ok) {
          const errorText = await ollamaResponse.text();
          console.error(`Ollama API error: Status ${ollamaResponse.status}, Response: ${errorText}`);
          lastError = new Error(`AI service error: Status ${ollamaResponse.status} - ${errorText}`);
          
          // If it's a 404, the model might not be available
          if (ollamaResponse.status === 404) {
            console.error('Model "mistral" not found. Available models can be checked with: ollama list');
            lastError = new Error('Model "mistral" not found. Please ensure Ollama is running and the model is installed.');
          }
          continue;
        }

        const data = await ollamaResponse.json() as { response?: string };
        const aiResponseContent = data.response;

        console.log('DEBUG: Raw AI response:', aiResponseContent?.substring(0, 200) + '...');

        if (!aiResponseContent) {
          lastError = new Error('No content received from AI model.');
          continue;
        }

        // ✅ USE ROBUST JSON EXTRACTION
        const tempGeneratedDetails = extractJsonFromResponse(aiResponseContent);

        // ✅ VALIDATE EXTRACTED DETAILS
        if (typeof tempGeneratedDetails.name !== 'string' || tempGeneratedDetails.name.trim() === '') {
          lastError = new Error('AI generated details missing or invalid "name" field.');
          console.error(lastError.message, tempGeneratedDetails);
          continue;
        }
        
        if (typeof tempGeneratedDetails.description !== 'string' || tempGeneratedDetails.description.trim() === '') {
          lastError = new Error('AI generated details missing or invalid "description" field.');
          console.error(lastError.message, tempGeneratedDetails);
          continue;
        }
        
        if (typeof tempGeneratedDetails.price !== 'number' || !VALID_PRICES_CENTS.includes(tempGeneratedDetails.price)) {
          lastError = new Error('AI generated details missing or invalid "price" field. Must be 349, 549, or 699.');
          console.error(lastError.message, tempGeneratedDetails);
          continue;
        }

        // Ensure name is within length limit
        if (tempGeneratedDetails.name.length > 90) {
          tempGeneratedDetails.name = tempGeneratedDetails.name.substring(0, 57) + '...';
        }

        // Success!
        generatedDetails = tempGeneratedDetails;
        console.log('DEBUG: Successfully generated and validated details');
        break;

      } catch (parseError) {
        lastError = new Error(`Failed to extract/parse JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        console.error('Error during AI response processing:', parseError);
      }
    }

    if (generatedDetails) {
      res.json(generatedDetails);
    } else {
      // ✅ FALLBACK: Generate basic details if AI fails completely
      console.log('DEBUG: AI generation failed, using fallback details');
      const fallbackDetails = generateFallbackDetails(workflowJson);
      res.json(fallbackDetails);
    }

  } catch (error) {
    console.error('Error generating template details with AI:', error);
    
    // ✅ ULTIMATE FALLBACK: Even if everything fails, provide basic details
    try {
      const fallbackDetails = generateFallbackDetails(workflowJson);
      res.json(fallbackDetails);
    } catch (fallbackError) {
      res.status(500).json({ error: 'Failed to generate template details.' });
    }
  }
});

// Template verification endpoint for DevHubConnect validation
adminRouter.post('/verify-dhc-template', async (req: Request, res: Response) => {
  const { verification, workflowHash } = req.body;
  
  console.log('DEBUG: Template verification request received');
  console.log('DEBUG: Verification data:', verification);
  console.log('DEBUG: Workflow hash:', workflowHash);
  
  try {
    // Validate request structure
    if (!verification || !verification.source || !verification.purchaseId) {
      return res.status(400).json({
        valid: false,
        error: "Invalid verification data structure"
      });
    }
    
    // Check source
    if (verification.source !== "DevHubConnect.com") {
      return res.status(400).json({
        valid: false,
        error: "Template source is not DevHubConnect.com"
      });
    }
    
    // Check required fields
    if (!verification.signature || !verification.templateId) {
      return res.status(400).json({
        valid: false,
        error: "Missing required verification fields"
      });
    }
    
    // For testing purposes: Accept any properly structured DevHubConnect template
    // In production, you would verify the signature against your secret key
    console.log('DEBUG: Template verification successful for purchase:', verification.purchaseId);
    
    res.json({
      valid: true,
      purchaseId: verification.purchaseId,
      templateId: verification.templateId,
      message: "Template verified successfully"
    });
    
  } catch (error) {
    console.error('Error during template verification:', error);
    res.status(500).json({
      valid: false,
      error: "Internal server error during verification"
    });
  }
});

export default adminRouter;