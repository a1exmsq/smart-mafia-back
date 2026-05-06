import { IsInt, IsOptional, Max, Min, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiPropertyOptional({ example: 10, description: 'Max players (2-20)' })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  maxPlayers?: number = 10;

  @ApiPropertyOptional({ example: { nightDurationSec: 60 } })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown> = {};
}

export class RoomResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() hostId: string;
  @ApiProperty() status: string;
  @ApiProperty() maxPlayers: number;
  @ApiProperty() playerCount: number;
  @ApiProperty() createdAt: Date;
}
