import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Response } from "express";
import { Observable, of } from "rxjs";
import { switchMap } from "rxjs/operators";

@Injectable()
export class NullJsonBodyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      switchMap((data) => {
        if (data === null || data === undefined) {
          if (!res.headersSent) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.status(200).send("null");
          }
          return of(undefined);
        }
        return of(data);
      }),
    );
  }
}
