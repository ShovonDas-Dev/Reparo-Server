import { createRemoteJWKSet, jwtVerify } from "jose";
import dotenv from "dotenv";


// The public keys of the Next.js app. Better Auth signs the token with a
// private key, and we check the signature with these public keys.
dotenv.config();

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.AUTH_URL}/api/auth/jwks`)
);



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
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.AUTH_URL,
      audience: process.env.AUTH_URL,
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