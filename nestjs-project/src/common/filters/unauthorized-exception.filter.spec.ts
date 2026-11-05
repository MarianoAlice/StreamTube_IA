import { ArgumentsHost, UnauthorizedException } from '@nestjs/common';
import { UnauthorizedExceptionFilter } from './unauthorized-exception.filter';

describe('UnauthorizedExceptionFilter', () => {
  it('maps a missing token to 401 with UNAUTHORIZED', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    new UnauthorizedExceptionFilter().catch(new UnauthorizedException(), host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message: 'Unauthorized',
    });
  });
});
