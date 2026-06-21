import { logger } from './logger';

/**
 * Safely parses a JSON string, returning a fallback value if parsing fails.
 * Prevents unhandled syntax errors from crashing the app during state hydration.
 */
export function safeJsonParse<T>(jsonString: string | undefined | null, fallback: T): T {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    logger.warn('[safeJsonParse] Failed to parse JSON:', error);
    return fallback;
  }
}
