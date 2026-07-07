import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

export interface AuthRequest extends Request {
  user?: User;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Authentication service unavailable' });
    }
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
        throw new Error('Invalid token');
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Error verifying Supabase token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
