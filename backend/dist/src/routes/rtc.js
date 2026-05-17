import { authenticateJWT } from '../middleware/auth.js';
const COTURN_REALM = process.env.COTURN_REALM || 'localhost';
const COTURN_SECRET = process.env.COTURN_SECRET || '';
// Generate TURN credentials using shared secret mechanism
function generateTurnCredentials(username) {
    // Use static credentials for now; in production implement HMAC-based timestamped credentials
    return {
        username: `${username}:${COTURN_REALM}`,
        credential: COTURN_SECRET
    };
}
export default async function rtcRoutes(fastify, _opts) {
    fastify.get('/ice-servers', { preValidation: [authenticateJWT] }, async (request, reply) => {
        const iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
        if (COTURN_SECRET) {
            const turnCreds = generateTurnCredentials(request.user.username);
            iceServers.push({
                urls: `turn:${COTURN_REALM}:3478`,
                username: turnCreds.username,
                credential: turnCreds.credential
            }, {
                urls: `turns:${COTURN_REALM}:5349`,
                username: turnCreds.username,
                credential: turnCreds.credential
            });
        }
        return reply.send({ iceServers });
    });
}
//# sourceMappingURL=rtc.js.map