import { createRemoteJWKSet, jwtVerify } from "jose";
import dotenv from "dotenv";

dotenv.config();

// Frontend (Next.js) er URL, shesh e "/" thakle muche felbe
const AUTH_URL = process.env.AUTH_URL?.trim().replace(/\/+$/, "");

// JWKS ta lazy banano hoy, jate AUTH_URL na thakleo server start e crash na kore
let JWKS;
const getJWKS = () => {
  if (!AUTH_URL) throw new Error("AUTH_URL is missing");
  JWKS ||= createRemoteJWKSet(new URL(`${AUTH_URL}/api/auth/jwks`));
  return JWKS;
};

// STEP 1: check that the request has a valid token.
export const verifyToken = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res
        .status(401)
        .send({ success: false, message: "Please sign in first" });
    }

    const token = header.split(" ")[1];

    // Signature ta amader nijer frontend er JWKS diye verify hoy (trusted key).
    // Tai issuer/audience er exact match dorkar nai, expiry o check hoy.
    const { payload } = await jwtVerify(token, getJWKS());

    // Debug: iss ta Logs e dekhar jonno (pore muche dite paren)
    if (payload.iss !== AUTH_URL) {
      console.log("iss differs. token iss:", payload.iss, "| AUTH_URL:", AUTH_URL);
    }

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