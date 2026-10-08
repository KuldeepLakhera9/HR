import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '@hrms/types';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'refreshToken',
  'refreshTokenHash',
  'tokenHash',
  'resetToken',
]);

function sanitizeResponseData<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeResponseData) as unknown as T;
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const cleanObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (!SENSITIVE_KEYS.has(key)) {
        cleanObj[key] = sanitizeResponseData(val);
      }
    }
    return cleanObj as T;
  }
  return obj;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((resData) => {
        // If handler already returned formatted envelope, preserve and sanitize data
        if (resData && typeof resData === 'object' && 'success' in resData && 'data' in resData) {
          return {
            ...(resData as ApiResponse<T>),
            data: sanitizeResponseData((resData as ApiResponse<T>).data),
          };
        }

        // If handler returned an object with message and data
        if (resData && typeof resData === 'object' && 'data' in resData && 'message' in resData) {
          return {
            success: true,
            message: resData.message || 'Operation successful',
            data: sanitizeResponseData(resData.data),
            meta: resData.meta || {},
          };
        }

        return {
          success: true,
          message: 'Operation successful',
          data: sanitizeResponseData(resData ?? null),
          meta: {},
        };
      }),
    );
  }
}
