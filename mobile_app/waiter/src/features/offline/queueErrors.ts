export class QueueSyncError extends Error {
  constructor(
    message: string,
    public readonly operationId?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "QueueSyncError";
  }
}

export class QueueConflictError extends QueueSyncError {
  constructor(message: string, operationId?: string, cause?: unknown) {
    super(message, operationId, cause);
    this.name = "QueueConflictError";
  }
}

export class QueueNetworkError extends QueueSyncError {
  constructor(message: string, operationId?: string, cause?: unknown) {
    super(message, operationId, cause);
    this.name = "QueueNetworkError";
  }
}

export function isQueueError(err: unknown): err is QueueSyncError {
  return err instanceof QueueSyncError;
}
