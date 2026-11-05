import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class InitiateUploadDto {
  @ApiProperty({ example: 'video/mp4' })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiProperty({ example: 1048576, minimum: 1 })
  @IsInt()
  @Min(1)
  sizeBytes: number;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  partCount: number;
}
