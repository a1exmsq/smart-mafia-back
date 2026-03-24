import { IsString, IsOptional, IsEnum, MaxLength, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum NarrationEvent {
  GAME_START = 'game_start',
  DAY_PHASE = 'day_phase',
  VOTING_PHASE = 'voting_phase',
  NIGHT_PHASE = 'night_phase',
  PLAYER_ELIMINATED = 'player_eliminated',
  GAME_OVER = 'game_over',
  CUSTOM = 'custom',
}

export class NarrateDto {
  @ApiProperty({ enum: NarrationEvent, example: NarrationEvent.DAY_PHASE })
  @IsEnum(NarrationEvent)
  event: NarrationEvent;

  @ApiPropertyOptional({ example: 'MAFIA1234' })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({ description: 'Extra context for the narrator', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  context?: string;

  @ApiPropertyOptional({
    description: 'Names of alive players',
    example: ['Alice', 'Bob', 'Charlie'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  playerNames?: string[];

  @ApiPropertyOptional({ description: 'Current round number', example: 2 })
  @IsOptional()
  round?: number;
}

export class ChatDto {
  @ApiProperty({ description: 'Player message to the AI narrator', maxLength: 300 })
  @IsString()
  @MaxLength(300)
  message: string;

  @ApiPropertyOptional({ example: 'MAFIA1234' })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({
    description: 'Conversation history for context',
    type: 'array',
  })
  @IsOptional()
  @IsArray()
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export class AiResponseDto {
  @ApiProperty({ description: 'AI generated narration text' })
  narration: string;

  @ApiProperty({ description: 'Model used' })
  model: string;

  @ApiProperty({ description: 'Token usage stats' })
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}
