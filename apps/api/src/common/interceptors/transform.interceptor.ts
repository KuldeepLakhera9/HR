import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '@hrms/types';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((resData) => {
        // If handler already returned formatted envelope, preserve it
        if (resData && typeof resData === 'object' && 'success' in resData && 'data' in resData) {
          return resData as ApiResponse<T>;
        }

        // If handler returned an object with message and data
        if (resData && typeof resData === 'object' && 'data' in resData && 'message' in resData) {
          return {
            success: true,
            message: resData.message || 'Operation successful',
            data: resData.data,
            meta: resData.meta || {},
          };
        }

        return {
          success: true,
          message: 'Operation successful',
          data: resData ?? null,
          meta: {},
        };
      }),
    );
  }
}
