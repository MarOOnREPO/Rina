import jwt from 'jsonwebtoken';
import fp from 'fastify-plugin';
const JWT_SECRET = process.env.JWT_SECRET || 'rina-dev-secret-min-32-chars-long!!';
const COOKIE_NAME = 'rina_auth_token';
// ─── JWT Helpers ─────────────────────────────────────────────────
export const generateToken = (payload) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};
export const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};
export const authPlugin = fp(async (fastify) => {
    fastify.decorateRequest('user', undefined);
    fastify.addHook('preParsing', async (request) => {
        const token = request.cookies[COOKIE_NAME] ||
            request.headers.authorization?.split(' ')[1];
        if (token) {
            try {
                request.user = verifyToken(token);
            }
            catch {
                // Invalid token — leave user undefined, protected routes will reject
            }
        }
    });
});
// ─── Route Guard ─────────────────────────────────────────────────
export async function authenticateJWT(request, reply) {
    if (!request.user) {
        await reply.status(401).send({ error: 'Authentication required' });
    }
}
//# sourceMappingURL=auth.js.map