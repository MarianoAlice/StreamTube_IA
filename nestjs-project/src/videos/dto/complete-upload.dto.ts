import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CompletedPartDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  partNumber: number;

  @ApiProperty({ example: 'etag-1' })
  @IsString()
  @IsNotEmpty()
  etag: string;
}

export class CompleteUploadDto {
  @ApiProperty({ type: [CompletedPartDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  parts: CompletedPartDto[];
}
