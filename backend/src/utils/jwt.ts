import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function signRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>, expiresInSeconds?: number): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: expiresInSeconds ?? env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JWTPayload;
}

export function verifyRefreshToken(token: string): JWTPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JWTPayload;
}
