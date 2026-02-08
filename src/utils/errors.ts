export class BaseError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthenticationError extends BaseError {
  constructor(message = 'Authentication required') { super(message, 401); }
}

export class AuthorizationError extends BaseError {
  constructor(message = 'Permission denied') { super(message, 403); }
}

export class NotFoundError extends BaseError {
  constructor(resource: string) { super(`${resource} not found`, 404); }
}

export class ValidationError extends BaseError {
  constructor(message: string) { super(message, 400); }
}

export class RateLimitError extends BaseError {
  constructor(message = 'Too many requests') { super(message, 429); }
}

export class ExternalServiceError extends BaseError {
  constructor(service: string, message: string) { super(`${service}: ${message}`, 502, false); }
}
