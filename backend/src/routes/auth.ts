import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { generateToken, authenticateJWT, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();
const COOKIE_NAME = 'rina_auth_token';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Hardcoded users with bcrypt hashes (password: rina2026)
const AUTHORIZED_USERS: Record<string, { username: string; passwordHash: string; displayName: string }> = {
  maroon: {
    username: 'maroon',
    passwordHash: '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW',
    displayName: 'MarOOn'
  },
  rina: {
    username: 'rina',
    passwordHash: '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW',
    displayName: 'Rina'
  }
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts.' }
});

router.post('/login', authLimiter, async (req, res): Promise<void> => {
  try {
    const { username, password } = req.body;
    const normalizedUser = username?.toString().toLowerCase().trim();

    const user = AUTHORIZED_USERS[normalizedUser];
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = generateToken({
      username: user.username,
      displayName: user.displayName
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    res.status(200).json({ user: { username: user.username, displayName: user.displayName } });
  } catch (error) {
    console.error('[Auth Error]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.status(200).json({ message: 'Logged out successfully' });
});

router.get('/me', authenticateJWT, (req: AuthenticatedRequest, res) => {
  res.status(200).json({ user: req.user });
});

export default router;
