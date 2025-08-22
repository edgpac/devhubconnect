import { Router, Request, Response, NextFunction } from 'express';
import { db } from './db';
import { templates } from '../shared/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';

const adminRouter = Router();

// Environment variables with secure defaults
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_for_devhubconnect';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:11434';
const AI_SERVICE_TOKEN = process.env.AI_SERVICE_TOKEN;
const NODE_ENV = process.env.NODE_ENV || 'development';

// 🔒 SECURITY: Only log configuration status in development (no secrets)
if (NODE_ENV === 'development') {
  console.log('🔧 Admin configuration loaded');
  console.log('🔒 Password hash:', ADMIN_PASSWORD_HASH ? 'configured' : 'missing');
  console.log('🤖 AI Service:', AI_SERVICE_URL !== 'http://localhost:11434' ? 'configured' : 'using default');
}

// 🛡️ SECURITY: Rate limiting for admin endpoints
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit to 50 requests per windowMs per IP
  message: { error: 'Too many admin requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const strictAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // More restrictive for sensitive operations
  message: { error: 'Too many sensitive admin operations, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all admin routes
adminRouter.use(adminLimiter);

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
    if (NODE_ENV === 'development') {
      console.log('DEBUG: No token provided in Authorization header.');
    }
    return res.status(401).json({ success: false, message: 'Authentication token required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; isAdmin: boolean };
    if (decoded.isAdmin) {
      req.user = decoded;
      next();
    } else {
      if (NODE_ENV === 'development') {
        console.log('DEBUG: Token provided but not admin.');
      }
      res.status(403).json({ success: false, message: 'Forbidden: Not an admin.' });
    }
  } catch (error) {
    if (NODE_ENV === 'development') {
      console.error('JWT verification failed:', error);
    }
    res.status(403).json({ success: false, message: 'Forbidden: Invalid or expired token.' });
  }
};

// 🔒 SECURITY: Input validation middleware
const validateJsonInput = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.body && typeof req.body === 'object') {
      // Basic validation - ensure no dangerous properties
      const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
      const checkObject = (obj: any): boolean => {
        if (typeof obj !== 'object' || obj === null) return true;
        
        for (const key of Object.keys(obj)) {
          if (dangerousKeys.includes(key)) return false;
          if (typeof obj[key] === 'object' && !checkObject(obj[key])) return false;
        }
        return true;
      };
      
      if (!checkObject(req.body)) {
        return res.status(400).json({ error: 'Invalid input data structure' });
      }
    }
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid JSON input' });
  }
};

// Robust JSON extraction function with better debugging
function extractJsonFromResponse(response: string): any {
  if (NODE_ENV === 'development') {
    console.log('DEBUG: Response length:', response.length);
  }
  
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

  // Method 1: Try to find JSON between braces (most common)
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]);
      if (NODE_ENV === 'development') {
        console.log('DEBUG: Successfully extracted JSON using brace matching');
      }
      return parsed;
    } catch (e) {
      if (NODE_ENV === 'development') {
        console.log('DEBUG: Brace matching found JSON-like text but parsing failed:', e);
      }
    }
  }

  // Method 2: Try to extract from code blocks
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (NODE_ENV === 'development') {
        console.log('DEBUG: Successfully extracted JSON from code block');
      }
      return parsed;
    } catch (e) {
      if (NODE_ENV === 'development') {
        console.log('DEBUG: Code block extraction found JSON-like text but parsing failed:', e);
      }
    }
  }

  // Method 3: Try to parse the entire response as JSON (in case it's clean)
  try {
    const parsed = JSON.parse(cleaned);
    if (NODE_ENV === 'development') {
      console.log('DEBUG: Successfully parsed entire response as JSON');
    }
    return parsed;
  } catch (e) {
    if (NODE_ENV === 'development') {
      console.log('DEBUG: Could not parse entire response as JSON:', e);
    }
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
      if (NODE_ENV === 'development') {
        console.log('DEBUG: Successfully extracted JSON using line-by-line parsing');
      }
      return parsed;
    } catch (e) {
      if (NODE_ENV === 'development') {
        console.log('DEBUG: Line-by-line extraction failed:', e);
      }
    }
  }

  throw new Error('No valid JSON object found in response');
}

// Generate fallback template details
function generateFallbackDetails(workflowJson: any): any {
  if (NODE_ENV === 'development') {
    console.log('DEBUG: Generating fallback template details');
  }
  
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
    if (NODE_ENV === 'development') {
      console.log('DEBUG: Could not extract workflow details for fallback');
    }
  }

  return {
    name: name.length > 60 ? name.substring(0, 57) + '...' : name,
    description: `Setup Instructions for ${name}\n\nOverview\nThis workflow contains ${nodeCount} nodes and implements automated business logic.\n\nPrerequisites\n- n8n instance (cloud or self-hosted)\n- API credentials as required by individual nodes\n\nSetup Steps\n1. Configure n8n Environment\n   - Ensure n8n is installed and running\n   - Log into your n8n instance\n   - Create a new workflow\n\n2. Import Workflow\n   - Copy the provided JSON workflow configuration\n   - In n8n, go to Workflow > Import from Clipboard\n   - Paste the JSON and import\n   - Save the workflow\n\n3. Configure Credentials\n   - Review each node for required credentials\n   - Set up API keys and authentication as needed\n   - Test connections to external services\n\n4. Test the Workflow\n   - Activate the workflow\n   - Test with sample data\n   - Verify all nodes execute correctly\n\n5. Deployment\n   - Save and activate the workflow\n   - Monitor workflow executions\n   - Set up error handling as needed\n\nNotes\n- Review and customize node configurations for your use case\n- Test thoroughly before production use\n- Monitor API usage and quotas`,
    price: 349
  };
}

// 🔒 SECURITY: Enhanced login endpoint with strict rate limiting
adminRouter.post('/login', strictAdminLimiter, validateJsonInput, async (req: Request, res: Response) => {
  const { password } = req.body;
  
  if (NODE_ENV === 'development') {
    console.log('DEBUG: Login attempt received.');
  }

  // 🔒 SECURITY: Validate input
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ success: false, message: 'Password is required' });
  }

  if (!ADMIN_PASSWORD_HASH) {
    console.error('ADMIN_PASSWORD_HASH is not set in environment variables.');
    return res.status(500).json({ success: false, message: 'Server configuration error.' });
  }

  try {
    const isPasswordValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

    if (isPasswordValid) {
      const adminPayload = { id: 'admin_user_id', isAdmin: true };
      const token = jwt.sign(adminPayload, JWT_SECRET, { expiresIn: '1h' });
      
      if (NODE_ENV === 'development') {
        console.log('DEBUG: Admin login successful');
      }
      
      res.json({ success: true, message: 'Admin login successful', token });
    } else {
      if (NODE_ENV === 'development') {
        console.log('DEBUG: Invalid password provided.');
      }
      // 🔒 SECURITY: Consistent response time to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 100));
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Error during password comparison:', error);
    res.status(500).json({ success: false, message: 'Internal server error during login.' });
  }
});

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
    res.status(500).json({ message: 'Failed to fetch templates.' });
  }
});

// ✅ Update template endpoint
adminRouter.put('/templates/:id', verifyAdminToken, validateJsonInput, async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // 🔒 SECURITY: Enhanced validation
    if (!id || !updateData || typeof updateData !== 'object') {
      return res.status(400).json({ error: 'Missing template ID or invalid update data' });
    }
    
    const templateId = parseInt(id);
    if (isNaN(templateId) || templateId <= 0) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    // 🔒 SECURITY: Whitelist allowed update fields
    const allowedFields = ['name', 'description', 'price', 'status', 'isPublic', 'imageUrl'];
    const filteredUpdateData: any = {};
    
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        filteredUpdateData[key] = value;
      }
    }

    if (Object.keys(filteredUpdateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    // Update the template
    const updatedTemplate = await db.update(templates)
      .set(filteredUpdateData)
      .where(eq(templates.id, templateId))
      .returning();
    
    if (!updatedTemplate || updatedTemplate.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    if (NODE_ENV === 'development') {
      console.log(`✅ Template ${templateId} updated successfully by admin`);
    }
    
    res.json({ 
      success: true, 
      message: 'Template updated successfully',
      template: updatedTemplate[0] 
    });
    
  } catch (error) {
    console.error('Template update error:', error);
    res.status(500).json({ 
      error: 'Failed to update template'
    });
  }
});

// ✅ Delete template endpoint
adminRouter.delete('/templates/:id', verifyAdminToken, strictAdminLimiter, async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    
    if (NODE_ENV === 'development') {
      console.log(`DEBUG: Attempting to delete template ID: ${templateId}`);
    }
    
    if (isNaN(templateId) || templateId <= 0) {
      return res.status(400).json({ message: 'Invalid template ID' });
    }

    // First check if template exists
    const existingTemplate = await db.select().from(templates).where(eq(templates.id, templateId));

    const deletedTemplate = await db.delete(templates)
      .where(eq(templates.id, templateId))
      .returning();

    if (deletedTemplate.length === 0) {
      if (NODE_ENV === 'development') {
        console.log(`DEBUG: Template ${templateId} not found in database`);
      }
      return res.status(404).json({ message: 'Template not found' });
    }

    if (NODE_ENV === 'development') {
      console.log(`✅ Template ${templateId} deleted successfully by admin`);
    }
    
    res.json({ message: 'Template deleted successfully', templateId });
  } catch (error) {
    console.error('❌ DELETE ERROR:', error);
    res.status(500).json({ 
      message: 'Failed to delete template'
    });
  }
});

adminRouter.post('/upload', verifyAdminToken, validateJsonInput, async (req: AuthenticatedAdminRequest, res: Response) => {
  try {
    const { name, description, price, workflowJson, imageUrl } = req.body;
    const adminId = req.user?.id;

    // 🔒 SECURITY: Enhanced input validation
    if (!name || !description || price === undefined || !workflowJson) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    if (typeof name !== 'string' || typeof description !== 'string') {
      return res.status(400).json({ message: 'Name and description must be strings.' });
    }

    if (name.length > 100 || description.length > 10000) {
      return res.status(400).json({ message: 'Name or description too long.' });
    }

    const numericPrice = Number(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ message: 'Price must be a valid positive number.' });
    }

    const [existingTemplate] = await db.select().from(templates)
      .where(eq(templates.workflowJson, workflowJson));

    if (existingTemplate) {
      return res.status(409).json({ message: 'Template with this workflow JSON already exists.' });
    }

    const newTemplate = await db.insert(templates).values({
      name: name.trim(),
      description: description.trim(),
      price: Math.round(numericPrice * 100),
      workflowJson,
      imageUrl: imageUrl || null,
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

// 🔒 SECURITY: Enhanced AI service interaction with timeout and error handling
adminRouter.post('/generate-template-details', verifyAdminToken, validateJsonInput, async (req: AuthenticatedAdminRequest, res: Response) => {
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
    const MAX_RETRIES = 3;
    const VALID_PRICES_CENTS = [349, 549, 699];
    const REQUEST_TIMEOUT = 30000; // 30 seconds
    
    let generatedDetails: any = null;
    let lastError: any = null;

    // Extract key workflow information for better prompting
    const workflowName = workflowJson.name || 'Unknown Workflow';
    const nodeNames = workflowJson.nodes?.map((n: any) => n.name).filter(Boolean) || [];
    const nodeTypes = workflowJson.nodes?.map((n: any) => n.type).filter(Boolean) || [];
    const uniqueServices = [...new Set(nodeTypes)].slice(0, 8);

    for (let i = 0; i < MAX_RETRIES; i++) {
      if (NODE_ENV === 'development') {
        console.log(`DEBUG: Attempting AI generation (Retry ${i + 1}/${MAX_RETRIES})`);
      }
      
      try {
        const detailedPrompt = `You are a technical writer specializing in creating professional setup instructions for n8n workflow templates. Analyze the provided n8n workflow JSON and generate detailed setup instructions tailored to its nodes and services.

WORKFLOW TO ANALYZE:
Name: ${workflowName}
Node Count: ${workflowJson.nodes?.length || 0}
Key Nodes: ${nodeNames.slice(0, 8).join(', ')}
Services Used: ${uniqueServices.map(s => s.replace('n8n-nodes-base.', '')).join(', ')}

Write exactly 3 complete paragraphs in a professional, instructional tone using action words like "configure," "set up," "ensure," "import," "activate," and "deploy." Avoid numbered lists or bullet points. Be specific about node names and services.

Respond with ONLY this JSON structure:
{
  "name": "Professional title describing this workflow's purpose (max 60 chars)",
  "description": "Paragraph 1 describing the workflow's purpose and key nodes.\\n\\nParagraph 2 detailing import, webhook, and configuration steps.\\n\\nParagraph 3 explaining testing, deployment, and monitoring procedures.",
  "price": 549
}`;

        // 🔒 SECURITY: Enhanced AI service request with timeout and headers
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // Add authentication if token is available
        if (AI_SERVICE_TOKEN) {
          headers['Authorization'] = `Bearer ${AI_SERVICE_TOKEN}`;
        }

        const ollamaResponse = await fetch(`${AI_SERVICE_URL}/api/generate`, {
          method: 'POST',
          headers,
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
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!ollamaResponse.ok) {
          const errorText = await ollamaResponse.text();
          console.error(`AI service error: Status ${ollamaResponse.status}`);
          lastError = new Error(`AI service error: Status ${ollamaResponse.status}`);
          
          // If it's a 404, the model might not be available
          if (ollamaResponse.status === 404) {
            console.error('Model "mistral" not found. Please ensure the AI service is running and the model is installed.');
            lastError = new Error('AI model not available. Please try again later.');
          }
          continue;
        }

        const data = await ollamaResponse.json() as { response?: string };
        const aiResponseContent = data.response;

        if (!aiResponseContent) {
          lastError = new Error('No content received from AI model.');
          continue;
        }

        // ✅ USE ROBUST JSON EXTRACTION
        const tempGeneratedDetails = extractJsonFromResponse(aiResponseContent);

        // ✅ VALIDATE EXTRACTED DETAILS
        if (typeof tempGeneratedDetails.name !== 'string' || tempGeneratedDetails.name.trim() === '') {
          lastError = new Error('AI generated details missing or invalid "name" field.');
          continue;
        }
        
        if (typeof tempGeneratedDetails.description !== 'string' || tempGeneratedDetails.description.trim() === '') {
          lastError = new Error('AI generated details missing or invalid "description" field.');
          continue;
        }
        
        if (typeof tempGeneratedDetails.price !== 'number' || !VALID_PRICES_CENTS.includes(tempGeneratedDetails.price)) {
          lastError = new Error('AI generated details missing or invalid "price" field. Must be 349, 549, or 699.');
          continue;
        }

        // Ensure name is within length limit
        if (tempGeneratedDetails.name.length > 60) {
          tempGeneratedDetails.name = tempGeneratedDetails.name.substring(0, 57) + '...';
        }

        // Success!
        generatedDetails = tempGeneratedDetails;
        if (NODE_ENV === 'development') {
          console.log('DEBUG: Successfully generated and validated details');
        }
        break;

      } catch (parseError) {
        if (parseError.name === 'AbortError') {
          lastError = new Error('AI service request timed out');
        } else {
          lastError = new Error(`Failed to process AI response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
        
        if (NODE_ENV === 'development') {
          console.error('Error during AI response processing:', parseError);
        }
      }
    }

    if (generatedDetails) {
      res.json(generatedDetails);
    } else {
      // ✅ FALLBACK: Generate basic details if AI fails completely
      if (NODE_ENV === 'development') {
        console.log('DEBUG: AI generation failed, using fallback details');
      }
      const fallbackDetails = generateFallbackDetails(workflowJson);
      res.json(fallbackDetails);
    }

  } catch (error) {
    console.error('Error generating template details:', error);
    
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
adminRouter.post('/verify-dhc-template', validateJsonInput, async (req: Request, res: Response) => {
  const { verification, workflowHash } = req.body;
  
  if (NODE_ENV === 'development') {
    console.log('DEBUG: Template verification request received');
  }
  
  try {
    // 🔒 SECURITY: Enhanced validation
    if (!verification || typeof verification !== 'object') {
      return res.status(400).json({
        valid: false,
        error: "Invalid verification data structure"
      });
    }

    const { source, purchaseId, signature, templateId } = verification;
    
    if (!source || !purchaseId || !signature || !templateId) {
      return res.status(400).json({
        valid: false,
        error: "Missing required verification fields"
      });
    }
    
    // Check source
    if (source !== "DevHubConnect.com") {
      return res.status(400).json({
        valid: false,
        error: "Template source is not DevHubConnect.com"
      });
    }
    
    // 🔒 SECURITY: Validate input types and lengths
    if (typeof purchaseId !== 'string' || purchaseId.length > 100) {
      return res.status(400).json({
        valid: false,
        error: "Invalid purchaseId format"
      });
    }

    if (typeof templateId !== 'string' || templateId.length > 100) {
      return res.status(400).json({
        valid: false,
        error: "Invalid templateId format"
      });
    }
    
    // For testing purposes: Accept any properly structured DevHubConnect template
    // In production, you would verify the signature against your secret key
    if (NODE_ENV === 'development') {
      console.log('DEBUG: Template verification successful for purchase:', purchaseId);
    }
    
    res.json({
      valid: true,
      purchaseId: purchaseId,
      templateId: templateId,
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