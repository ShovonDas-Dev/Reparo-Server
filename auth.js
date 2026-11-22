import { createRemoteJWKSet, jwtVerify } from "jose";
import dotenv from "dotenv";

dotenv.config();

// Frontend (Next.js) er URL, shesh e "/" thakle muche felbe
const AUTH_URL = process.env.AUTH_URL?.replace(/\/$/, "");

// JWKS ta lazy banano hoy, jate AUTH_URL na thakleo server start e crash na kore
let JWKS;
const getJWKS = () => {
  if (!AUTH_URL) throw new Error("AUTH_URL is missing");
  JWKS ||= createRemoteJWKSet(new URL(`${AUTH_URL}/api/auth/jwks`));
  return JWKS;
};

// STEP 1: check that the request has a valid token.
// If it is valid, we save the user in req.user so the route can use it.
export const verifyToken = async (req, res, next) => {
  try {
    // The token comes in the header: Authorization: Bearer <token>
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res
        .status(401)
        .send({ success: false, message: "Please sign in first" });
    }

    const token = header.split(" ")[1];

    // Check the signature, the issuer and the expiry time
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: AUTH_URL,
      audience: AUTH_URL,
    });

    // The logged in user. It comes from the token, NOT from the request body.
    req.user = {
      id: payload.sub || payload.id,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (error) {
    console.error("Token check failed:", error.message);
    return res
      .status(401)
      .send({ success: false, message: "Invalid or expired token" });
  }
};

// STEP 2: allow only some roles. Example: requireRole("admin")
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user?.role)) {
      return res
        .status(403)
        .send({ success: false, message: "You are not allowed to do this" });
    }
    next();
  };
};