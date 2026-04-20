export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class UnbalancedEntryError extends AppError {
  constructor() {
    super(
      'Journal entry is unbalanced: total debits must equal total credits',
      400,
      'UNBALANCED_ENTRY',
    );
  }
}

export class PeriodClosedError extends AppError {
  constructor() {
    super('Cannot post to a closed or locked accounting period', 400, 'PERIOD_CLOSED');
  }
}

export class AccountLockedError extends AppError {
  constructor(accountCode: string) {
    super(`Account ${accountCode} is locked and cannot receive new entries`, 400, 'ACCOUNT_LOCKED');
  }
}

export class ImmutableEntryError extends AppError {
  constructor() {
    super(
      'Posted journal entries cannot be edited. Create a reversing entry instead.',
      400,
      'IMMUTABLE_ENTRY',
    );
  }
}

export class DuplicateDepreciationError extends AppError {
  constructor(period: string) {
    super(
      `Depreciation has already been run for period: ${period}`,
      400,
      'DUPLICATE_DEPRECIATION',
    );
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
