// Tokens are stored in httpOnly cookies set by the server.
// JavaScript cannot (and should not) access them directly.
// This module is intentionally minimal — auth state is determined
// by calling /auth/me (cookie sent automatically by the browser).
