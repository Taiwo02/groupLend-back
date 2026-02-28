import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type JwtPayload = {
  sub: string;
  email: string;
};

export const hashValue = async (plain: string): Promise<string> => bcrypt.hash(plain, 12);

export const compareHash = async (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

export const signJwt = (payload: JwtPayload): string =>
  jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"]
  });

export const verifyJwt = (token: string): JwtPayload =>
  jwt.verify(token, env.jwtSecret) as JwtPayload;
