import bcrypt from 'bcryptjs';
import { generateToken, authenticateJWT } from '../middleware/auth.js';
const COOKIE_NAME = 'rina_auth_token';
const NODE_ENV = process.env.NODE_ENV || 'development';
const AUTHORIZED_USERS = {
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
export default async function authRoutes(fastify, _opts) {
    fastify.post('/login', {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '15 minutes'
            }
        }
    }, async (request, reply) => {
        try {
            const body = request.body;
            const { username, password } = body;
            const normalizedUser = username?.toString().toLowerCase().trim();
            const user = AUTHORIZED_USERS[normalizedUser || ''];
            if (!user) {
                return reply.status(401).send({ error: 'Invalid credentials' });
            }
            const validPassword = await bcrypt.compare(password || '', user.passwordHash);
            if (!validPassword) {
                return reply.status(401).send({ error: 'Invalid credentials' });
            }
            const token = generateToken({
                username: user.username,
                displayName: user.displayName
            });
            reply.setCookie(COOKIE_NAME, token, {
                httpOnly: true,
                secure: NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/'
            });
            return reply.status(200).send({ user: { username: user.username, displayName: user.displayName } });
        }
        catch (error) {
            console.error('[Auth Error]', error);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });
    fastify.post('/logout', async (_request, reply) => {
        reply.clearCookie(COOKIE_NAME, { path: '/' });
        return reply.status(200).send({ message: 'Logged out successfully' });
    });
    fastify.get('/me', { preValidation: [authenticateJWT] }, async (request, reply) => {
        return reply.status(200).send({ user: request.user });
    });
}
//# sourceMappingURL=auth.js.map