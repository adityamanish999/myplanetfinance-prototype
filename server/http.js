'use strict';

/** An error whose status, code and message are safe to send to the browser. */
class HttpError extends Error {
  constructor(status, code, publicMessage) {
    super(publicMessage);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

function sendError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

function requireJson(req, res, next) {
  if (!req.is('application/json')) {
    return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Requests must be sent as JSON.');
  }
  next();
}

function rateLimit(limiter, message = "You're doing that too often. Please wait a moment and try again.") {
  return (req, res, next) => {
    const result = limiter.check(req.ip);
    if (!result.allowed) {
      res.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      return sendError(res, 429, 'RATE_LIMITED', message);
    }
    next();
  };
}

module.exports = { HttpError, sendError, requireJson, rateLimit };
