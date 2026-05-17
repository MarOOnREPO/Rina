import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
export interface JWTPayload {
    username: string;
    displayName: string;
    iat?: number;
    exp?: number;
}
export declare const generateToken: (payload: Omit<JWTPayload, "iat" | "exp">) => string;
export declare const verifyToken: (token: string) => JWTPayload;
declare module 'fastify' {
    interface FastifyRequest {
        user?: JWTPayload;
    }
}
export declare const authPlugin: (fastify: FastifyInstance) => Promise<void>;
export declare function authenticateJWT(request: FastifyRequest, reply: FastifyReply): Promise<void>;
//# sourceMappingURL=auth.d.ts.map