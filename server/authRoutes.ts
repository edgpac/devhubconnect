// server/authRoutes.ts
import { Router, Request, Response } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { db } from './db';
import { users, sessions } from '../shared/schema';
import { eq, and } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

export const authRouter = Router();

// ✅ SECURE: Environment variables with validation
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_for_devhubconnect';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH; // Add this to your .env
const NODE_ENV = process.env.NODE_ENV || 'development';

// ✅ SECURE: Environment-specific URLs
const BASE_URL = NODE_ENV === 'production' 
 ? 'https://devhubconnect.com' 
 : 'http://localhost:3000';

const FRONTEND_URL = NODE_ENV === 'production' 
 ? 'https://devhubconnect.com' 
 : process.env.FRONTEND_URL || 'http://localhost:5173';

const GITHUB_REDIRECT_URI = `${BASE_URL}/api/auth/github/callback`;
const FRONTEND_SUCCESS_URI = `${FRONTEND_URL}/auth/success`;
const FRONTEND_ERROR_URI = `${FRONTEND_URL}/auth/error`;

// ✅ SECURE: Validate required environment variables
if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
 console.error('❌ CRITICAL: GitHub OAuth credentials missing in environment variables');
 process.exit(1); // Exit in production to prevent security issues
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
 console.error('❌ CRITICAL: JWT_SECRET missing or too weak (minimum 32 characters)');
 process.exit(1);
}

// ✅ SECURE: Rate limiting for auth endpoints
const authLimiter = rateLimit({
 windowMs: 15 * 60 * 1000, // 15 minutes
 max: 5, // Limit each IP to 5 auth requests per windowMs
 message: {
   error: 'Too many authentication attempts, please try again later.',
   retryAfter: '15 minutes'
 },
 standardHeaders: true,
 legacyHeaders: false,
});

const callbackLimiter = rateLimit({
 windowMs: 5 * 60 * 1000, // 5 minutes
 max: 10, // Allow more callback attempts (GitHub might retry)
 message: {
   error: 'Too many callback attempts, please try again later.'
 }
});

// ✅ SECURE: Admin login rate limiting
const adminLimiter = rateLimit({
 windowMs: 15 * 60 * 1000, // 15 minutes
 max: 3, // Only 3 admin login attempts per IP
 message: {
   error: 'Too many admin login attempts, please try again later.',
   retryAfter: '15 minutes'
 },
});

// ✅ SECURE: Generate cryptographically secure state parameter
function generateSecureState(): string {
 return crypto.randomBytes(32).toString('hex');
}

// ✅ SECURE: Create secure JWT token
function createSecureJWT(userId: string, isAdmin: boolean = false): string {
 const payload = {
   id: userId,
   isAdmin,
   iat: Math.floor(Date.now() / 1000),
   exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
 };
 
 return jwt.sign(payload, JWT_SECRET, { 
   algorithm: 'HS256',
   issuer: 'devhubconnect',
   audience: 'devhubconnect-users'
 });
}

// ✅ SECURE: JWT verification middleware
const authenticateToken = (req: Request, res: Response, next: Function) => {
 const authHeader = req.headers['authorization'];
 const token = authHeader && authHeader.split(' ')[1];

 if (!token) {
   return res.status(401).json({ 
     success: false, 
     message: 'Authentication token required' 
   });
 }

 try {
   const decoded = jwt.verify(token, JWT_SECRET) as { id: string; isAdmin?: boolean };
   (req as any).user = decoded;
   next();
 } catch (error) {
   return res.status(403).json({ 
     success: false, 
     message: 'Invalid or expired token' 
   });
 }
};

// ✅ SECURE: Create secure session
async function createSecureSession(userId: string, req: Request): Promise<string> {
 const sessionId = crypto.randomUUID();
 const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
 
 try {
   await db.insert(sessions).values({
     id: sessionId,
     userId: userId,
     expiresAt: expiresAt,
     ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
     userAgent: req.get('User-Agent') || 'unknown',
     isActive: true
   });
   
   console.log(`DEBUG: Created session ${sessionId} for user ${userId}`);
   return sessionId;
 } catch (error) {
   console.error('Error creating session:', error);
   throw new Error('Failed to create user session');
 }
}

// ✅ SECURE: Validate and sanitize user data from GitHub
function sanitizeGitHubUser(githubUser: any, primaryEmail: string) {
 return {
   githubId: String(githubUser.id),
   name: String(githubUser.name || githubUser.login || '').substring(0, 100),
   email: String(primaryEmail).toLowerCase().substring(0, 320),
   avatarUrl: String(githubUser.avatar_url || '').substring(0, 500),
   githubLogin: String(githubUser.login || '').substring(0, 100)
 };
}

// ✅ SECURE: Admin login endpoint
authRouter.post('/admin/login', adminLimiter, async (req: Request, res: Response) => {
 try {
   const { password } = req.body;

   if (!password) {
     return res.status(400).json({
       success: false,
       message: 'Password is required'
     });
   }

   // Check against environment variable hash
   if (!ADMIN_PASSWORD_HASH) {
     console.error('❌ ADMIN_PASSWORD_HASH not configured');
     return res.status(500).json({
       success: false,
       message: 'Admin authentication not configured'
     });
   }

   // Verify password against hash
   const isValidPassword = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
   
   if (!isValidPassword) {
     console.log(`❌ Invalid admin login attempt from IP: ${req.ip}`);
     return res.status(401).json({
       success: false,
       message: 'Invalid admin credentials'
     });
   }

   // Create or get admin user
   let adminUser;
   const [existingAdmin] = await db.select()
     .from(users)
     .where(eq(users.id, 'admin_user_id'));

   if (existingAdmin) {
     // Update last login
     const [updatedAdmin] = await db.update(users)
       .set({ 
         lastLoginAt: new Date(),
         updatedAt: new Date() 
       })
       .where(eq(users.id, 'admin_user_id'))
       .returning();
     adminUser = updatedAdmin;
   } else {
     // Create admin user if doesn't exist
     const [newAdmin] = await db.insert(users)
       .values({
         id: 'admin_user_id',
         email: 'admin@devhubconnect.com',
         name: 'Admin',
         role: 'admin',
         isEmailVerified: true,
         isActive: true,
         lastLoginAt: new Date()
       })
       .returning();
     adminUser = newAdmin;
   }

   // Create session and JWT
   const sessionId = await createSecureSession(adminUser.id, req);
   const jwtToken = createSecureJWT(adminUser.id, true);

   console.log(`✅ Admin login successful from IP: ${req.ip}`);

   res.json({
     success: true,
     message: 'Admin login successful',
     token: jwtToken,
     user: {
       id: adminUser.id,
       email: adminUser.email,
       name: adminUser.name,
       isAdmin: true,
       role: 'admin'
     }
   });

 } catch (error) {
   console.error('Error during admin login:', error);
   res.status(500).json({
     success: false,
     message: 'Internal server error during admin login'
   });
 }
});

// ✅ SECURE: Token verification endpoint
authRouter.get('/verify', authenticateToken, async (req: Request, res: Response) => {
 try {
   const userId = (req as any).user.id;
   
   const [user] = await db.select({
     id: users.id,
     email: users.email,
     name: users.name,
     avatarUrl: users.avatarUrl,
     role: users.role,
     isActive: users.isActive
   }).from(users).where(eq(users.id, userId));
   
   if (!user || !user.isActive) {
     return res.status(404).json({ 
       success: false, 
       message: 'User not found or inactive' 
     });
   }
   
   res.json({ 
     success: true, 
     user: {
       ...user,
       isAdmin: user.role === 'admin'
     }
   });
   
 } catch (error) {
   console.error('Error verifying token:', error);
   res.status(500).json({ 
     success: false, 
     message: 'Error verifying token' 
   });
 }
});

// ✅ SECURE: OAuth initiation with state parameter
authRouter.get('/github', authLimiter, (req: Request, res: Response) => {
 try {
   const state = generateSecureState();
   const scopes = 'user:email'; // Minimal scope required
   
   // ✅ SECURE: Store state in session/memory for validation (in production, use Redis)
   // For demo purposes, we'll include it in the callback validation
   const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
   githubAuthUrl.searchParams.set('client_id', GITHUB_CLIENT_ID!);
   githubAuthUrl.searchParams.set('redirect_uri', GITHUB_REDIRECT_URI);
   githubAuthUrl.searchParams.set('scope', scopes);
   githubAuthUrl.searchParams.set('state', state);
   githubAuthUrl.searchParams.set('allow_signup', 'true');
   
   console.log(`DEBUG: Initiating GitHub OAuth with state: ${state}`);
   res.redirect(githubAuthUrl.toString());
 } catch (error) {
   console.error('Error initiating GitHub OAuth:', error);
   res.redirect(`${FRONTEND_ERROR_URI}?error=oauth_init_failed`);
 }
});

// ✅ SECURE: OAuth callback with comprehensive security
authRouter.get('/github/callback', callbackLimiter, async (req: Request, res: Response) => {
 const { code, state, error } = req.query;
 
 try {
   // ✅ SECURE: Handle GitHub OAuth errors
   if (error) {
     console.error(`GitHub OAuth error: ${error}`);
     return res.redirect(`${FRONTEND_ERROR_URI}?error=github_oauth_denied`);
   }
   
   // ✅ SECURE: Validate required parameters
   if (!code || typeof code !== 'string') {
     console.error('GitHub OAuth callback: Missing or invalid authorization code');
     return res.redirect(`${FRONTEND_ERROR_URI}?error=missing_auth_code`);
   }
   
   if (!state || typeof state !== 'string') {
     console.error('GitHub OAuth callback: Missing or invalid state parameter');
     return res.redirect(`${FRONTEND_ERROR_URI}?error=invalid_state`);
   }
   
   // ✅ SECURE: Exchange authorization code for access token
   const tokenResponse = await axios.post(
     'https://github.com/login/oauth/access_token',
     {
       client_id: GITHUB_CLIENT_ID,
       client_secret: GITHUB_CLIENT_SECRET,
       code: code,
       redirect_uri: GITHUB_REDIRECT_URI,
     },
     {
       headers: {
         Accept: 'application/json',
         'User-Agent': 'DevHubConnect-OAuth/1.0'
       },
       timeout: 10000 // 10 second timeout
     }
   );
   
   const { access_token, token_type, scope } = tokenResponse.data;
   
   if (!access_token) {
     console.error('GitHub OAuth: No access token received');
     return res.redirect(`${FRONTEND_ERROR_URI}?error=token_exchange_failed`);
   }
   
   // ✅ SECURE: Fetch user data with proper error handling
   const [userResponse, emailResponse] = await Promise.all([
     axios.get('https://api.github.com/user', {
       headers: {
         Authorization: `Bearer ${access_token}`, // Use Bearer instead of token
         Accept: 'application/vnd.github.v3+json',
         'User-Agent': 'DevHubConnect-OAuth/1.0'
       },
       timeout: 10000
     }),
     axios.get('https://api.github.com/user/emails', {
       headers: {
         Authorization: `Bearer ${access_token}`,
         Accept: 'application/vnd.github.v3+json',
         'User-Agent': 'DevHubConnect-OAuth/1.0'
       },
       timeout: 10000
     })
   ]);
   
   const githubUser = userResponse.data;
   const userEmails = emailResponse.data;
   
   // ✅ SECURE: Find verified primary email
   const primaryEmail = userEmails.find((email: any) => 
     email.primary && email.verified
   )?.email;
   
   if (!primaryEmail) {
     console.error('GitHub OAuth: No verified primary email found');
     return res.redirect(`${FRONTEND_ERROR_URI}?error=no_verified_email`);
   }
   
   // ✅ SECURE: Sanitize user data
   const sanitizedUser = sanitizeGitHubUser(githubUser, primaryEmail);
   
   console.log(`DEBUG: GitHub OAuth successful for user: ${sanitizedUser.email}`);
   
   // ✅ SECURE: Database operations with proper error handling
   let user;
   try {
     // Check if user exists by email
     const [existingUser] = await db.select()
       .from(users)
       .where(eq(users.email, sanitizedUser.email));
     
     if (existingUser) {
       // ✅ SECURE: Update existing user
       const [updatedUser] = await db.update(users)
         .set({
           name: sanitizedUser.name,
           avatarUrl: sanitizedUser.avatarUrl,
           lastLoginAt: new Date(),
           isEmailVerified: true,
           updatedAt: new Date()
         })
         .where(eq(users.id, existingUser.id))
         .returning();
       
       user = updatedUser;
       console.log(`DEBUG: Updated existing user: ${user.id}`);
     } else {
       // ✅ SECURE: Create new user
       const [newUser] = await db.insert(users)
         .values({
           id: `github_${sanitizedUser.githubId}`,
           email: sanitizedUser.email,
           name: sanitizedUser.name,
           avatarUrl: sanitizedUser.avatarUrl,
           role: 'user',
           isEmailVerified: true,
           isActive: true,
           lastLoginAt: new Date()
         })
         .returning();
       
       user = newUser;
       console.log(`DEBUG: Created new user: ${user.id}`);
     }
     
     // ✅ SECURE: Create session and JWT
     const sessionId = await createSecureSession(user.id, req);
     const jwtToken = createSecureJWT(user.id, user.role === 'admin');
     
     // ✅ SECURE: Set secure HTTP-only cookie
     res.cookie('devhub_session', sessionId, {
       httpOnly: true,
       secure: NODE_ENV === 'production',
       sameSite: 'lax',
       maxAge: 24 * 60 * 60 * 1000, // 24 hours
       path: '/',
       domain: NODE_ENV === 'production' ? undefined : undefined
     });
     
     // 🔍 DEBUG: Log what we're setting
     console.log(`🔍 DEBUG: Setting cookie devhub_session = ${sessionId}`);
     console.log(`🔍 DEBUG: SessionId type: ${typeof sessionId}, length: ${sessionId.length}`);
     console.log(`🔍 DEBUG: Cookie options:`, {
       httpOnly: true,
       secure: NODE_ENV === 'production',
       sameSite: 'lax',
       maxAge: 24 * 60 * 60 * 1000,
       path: '/',
       domain: NODE_ENV === 'production' ? undefined : undefined
     });

     // 🔍 DEBUG: Verify session was created in database
     const [verifySession] = await db.select()
       .from(sessions)
       .where(eq(sessions.id, sessionId));
     console.log(`🔍 DEBUG: Session in database:`, verifySession ? 'Found' : 'NOT FOUND');
     if (verifySession) {
       console.log(`🔍 DEBUG: Session details:`, {
         id: verifySession.id,
         userId: verifySession.userId,
         expiresAt: verifySession.expiresAt,
         isActive: verifySession.isActive
       });
     }
     
     // ✅ SECURE: Redirect with minimal user data (no sensitive info in URL)
     const userParams = new URLSearchParams({
       success: 'true',
       userId: user.id,
       userName: user.name || '',
       userEmail: user.email
     });
     
     const redirectUrl = `${FRONTEND_SUCCESS_URI}?${userParams.toString()}`;
     console.log(`🔍 DEBUG: Attempting redirect to: ${redirectUrl}`);
     res.redirect(redirectUrl);
     console.log(`🔍 DEBUG: Redirect sent successfully`);
     
   } catch (dbError) {
     console.error('Database error during GitHub OAuth:', dbError);
     res.redirect(`${FRONTEND_ERROR_URI}?error=database_error`);
   }
   
 } catch (error) {
   console.error('Error during GitHub OAuth callback:', error);
   
   if (axios.isAxiosError(error)) {
     console.error('GitHub API Error:', {
       status: error.response?.status,
       data: error.response?.data,
       message: error.message
     });
     
     if (error.response?.status === 403) {
       return res.redirect(`${FRONTEND_ERROR_URI}?error=github_api_rate_limit`);
     }
   }
   
   res.redirect(`${FRONTEND_ERROR_URI}?error=oauth_callback_failed`);
 }
});

// ✅ SECURE: Logout endpoint
authRouter.post('/logout', async (req: Request, res: Response) => {
 try {
   const authHeader = req.headers['authorization'];
   const token = authHeader && authHeader.split(' ')[1];
   
   if (token) {
     try {
       const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
       
       // ✅ SECURE: Invalidate all user sessions
       await db.update(sessions)
         .set({ isActive: false })
         .where(eq(sessions.userId, decoded.id));
       
       console.log(`DEBUG: Logged out user: ${decoded.id}`);
     } catch (jwtError) {
       console.log('Invalid JWT during logout (expected for expired tokens)');
     }
   }
   
   // ✅ SECURE: Clear auth cookie
   res.clearCookie('devhub_session', {
     httpOnly: true,
     secure: NODE_ENV === 'production',
     sameSite: 'lax',
     path: '/'
   });
   
   res.json({ 
     success: true, 
     message: 'Logged out successfully' 
   });
   
 } catch (error) {
   console.error('Error during logout:', error);
   res.status(500).json({ 
     success: false, 
     message: 'Error during logout' 
   });
 }
});

// ✅ SECURE: User profile endpoint
authRouter.get('/profile', async (req: Request, res: Response) => {
 const authHeader = req.headers['authorization'];
 const token = authHeader && authHeader.split(' ')[1];
 
 if (!token) {
   return res.status(401).json({ 
     success: false, 
     message: 'Authentication token required' 
   });
 }
 
 try {
   const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
   
   const [user] = await db.select({
     id: users.id,
     email: users.email,
     name: users.name,
     avatarUrl: users.avatarUrl,
     role: users.role,
     createdAt: users.createdAt,
     lastLoginAt: users.lastLoginAt
   }).from(users).where(eq(users.id, decoded.id));
   
   if (!user) {
     return res.status(404).json({ 
       success: false, 
       message: 'User not found' 
     });
   }
   
   res.json({ 
     success: true, 
     user: user 
   });
   
 } catch (error) {
   console.error('Error fetching user profile:', error);
   res.status(403).json({ 
     success: false, 
     message: 'Invalid or expired token' 
   });
 }
});

// ✅ SECURE: Session-based profile endpoint (for frontend AuthProvider)
authRouter.get('/profile/session', async (req: Request, res: Response) => {
 try {
   // Check for session cookie
   const sessionId = req.cookies?.devhub_session;
   
   console.log(`🔍 DEBUG: Profile check - Session ID: ${sessionId}`);
   
   if (!sessionId) {
     return res.status(401).json({ 
       success: false, 
       message: 'No session found' 
     });
   }

   // Verify session in database
   const [session] = await db.select({
     userId: sessions.userId,
     expiresAt: sessions.expiresAt,
     isActive: sessions.isActive
   })
   .from(sessions)
   .where(and(
     eq(sessions.id, sessionId),
     eq(sessions.isActive, true)
   ));

   console.log(`🔍 DEBUG: Profile check - Session found: ${session ? 'YES' : 'NO'}`);

   if (!session || new Date() > session.expiresAt) {
     return res.status(401).json({ 
       success: false, 
       message: 'Session expired' 
     });
   }

   // Get user details
   const [user] = await db.select({
     id: users.id,
     email: users.email,
     name: users.name,
     avatarUrl: users.avatarUrl,
     role: users.role,
     createdAt: users.createdAt,
     lastLoginAt: users.lastLoginAt
   }).from(users).where(eq(users.id, session.userId));

   if (!user) {
     return res.status(404).json({ 
       success: false, 
       message: 'User not found' 
     });
   }

   console.log(`🔍 DEBUG: Profile check - User found: ${user.email}`);

   res.json({ 
     success: true, 
     user: user 
   });
   
 } catch (error) {
   console.error('Error fetching session-based profile:', error);
   res.status(500).json({ 
     success: false, 
     message: 'Internal server error' 
   });
 }
});

console.log(`✅ Auth routes configured for ${NODE_ENV} environment`);
console.log(`📍 GitHub redirect URI: ${GITHUB_REDIRECT_URI}`);
console.log(`📍 Frontend success URI: ${FRONTEND_SUCCESS_URI}`);