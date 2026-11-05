import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(UnauthorizedException)
export class UnauthorizedExceptionFilter implements ExceptionFilter {
  catch(exception: UnauthorizedException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = exception.getResponse();
    const message =
      typeof body === 'string'
        ? body
        : ((body as { message?: string | string[] }).message ??
          exception.message);

    response.status(401).json({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message,
    });
  }
}
