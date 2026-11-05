import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('uploads')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start a multipart video upload',
    description:
      'Creates a draft video and returns presigned part URLs. The API does not receive the file bytes.',
  })
  @ApiResponse({
    status: 201,
    description: 'Draft created and part URLs issued',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        status: { type: 'string', example: 'draft' },
        uploadId: { type: 'string' },
        parts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              partNumber: { type: 'number' },
              url: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 413,
    description: 'Upload exceeds 10GB',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  initiate(@CurrentUser() user: JwtPayload, @Body() dto: InitiateUploadDto) {
    return this.videosService.initiate(user.sub, dto);
  }

  @Post(':id/complete')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Complete a multipart video upload',
    description:
      'Finishes the multipart upload, enqueues processing, and moves the draft to processing.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 202,
    description: 'Video accepted for processing',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        status: { type: 'string', example: 'processing' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 403,
    description: 'Authenticated user does not own the video channel',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not a draft',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  complete(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.videosService.complete(user.sub, id, dto);
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Read a video',
    description:
      'Returns the public id, status, and duration. No access token is required.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Video found',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        status: {
          type: 'string',
          enum: ['draft', 'processing', 'ready', 'failed'],
        },
        duration_seconds: { type: 'number', nullable: true },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.videosService.findOne(id);
  }

  @Public()
  @Get(':id/playback')
  @ApiOperation({
    summary: 'Get a playback URL',
    description:
      'Returns a presigned GET URL. The client sends Range to storage. The API does not stream the file.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Presigned playback URL',
    schema: { properties: { url: { type: 'string' } } },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not ready',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  playback(@Param('id', ParseUUIDPipe) id: string) {
    return this.videosService.playbackUrl(id);
  }

  @Public()
  @Get(':id/download')
  @ApiOperation({
    summary: 'Get a download URL',
    description:
      'Returns the same presigned GET as playback, with a Content-Disposition override. The API does not send the file.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Presigned download URL',
    schema: { properties: { url: { type: 'string' } } },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not ready',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  download(@Param('id', ParseUUIDPipe) id: string) {
    return this.videosService.downloadUrl(id);
  }
}
