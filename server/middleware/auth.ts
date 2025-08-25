import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { sessions, users } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    isAdmin: boolean;
    email?: string;
  };
}

const authenticateUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.cookies?.devhub_session;
    
    if (!sessionId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required for this operation.',
        loginUrl: '/auth/github'
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

    if (!session || new Date() > session.expiresAt) {
      return res.status(401).json({ 
        success: false, 
        message: 'Session expired. Please log in again.',
        loginUrl: '/auth/github'
      });
    }

    // Get user details
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, session.userId));

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found.',
        loginUrl: '/auth/github'
      });
    }

    req.user = { 
      id: user.id, 
      isAdmin: user.role === 'admin',
      email: user.email 
    };
    
    next();
  } catch (error) {
    console.error('Session verification failed:', error);
    res.status(403).json({ 
      success: false, 
      message: 'Invalid session.',
      loginUrl: '/auth/github'
    });
  }
};

export { authenticateUser, AuthenticatedRequest };
