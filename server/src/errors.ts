/*
 * Typed HTTP error carrying the uniform API error shape
 * ({ error: { code, message } }). Route handlers and callLLM throw this;
 * the app-level error handler in app.ts turns it into the JSON response.
 * Express 5 forwards rejections from async handlers automatically.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
