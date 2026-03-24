import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { GameStateService } from './game-state.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

class VoteDto {
  @ApiProperty({ description: 'Player ID to vote against' })
  @IsString()
  targetId: string;

  @ApiProperty({ description: 'Voter player ID' })
  @IsString()
  voterId: string;
}

@ApiTags('game')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('game')
export class GameStateController {
  constructor(private readonly gameStateService: GameStateService) {}

  @Post(':roomId/init')
  @ApiOperation({ summary: 'Initialize game state after room starts' })
  @ApiParam({ name: 'roomId' })
  @ApiResponse({ status: 201, description: 'Game state created' })
  init(@Param('roomId') roomId: string) {
    return this.gameStateService.initGame(roomId);
  }

  @Get(':roomId/state')
  @ApiOperation({ summary: 'Get current game state snapshot' })
  @ApiParam({ name: 'roomId' })
  @ApiResponse({ status: 200, description: 'Current game snapshot' })
  getState(@Param('roomId') roomId: string) {
    return this.gameStateService.getCurrentState(roomId);
  }

  @Post(':roomId/advance')
  @ApiOperation({ summary: 'Advance to next game phase (DAY → VOTING → NIGHT → DAY)' })
  @ApiParam({ name: 'roomId' })
  advance(@Param('roomId') roomId: string) {
    return this.gameStateService.advancePhase(roomId);
  }

  @Post(':roomId/vote')
  @ApiOperation({ summary: 'Record a vote during VOTING phase' })
  @ApiParam({ name: 'roomId' })
  vote(@Param('roomId') roomId: string, @Body() dto: VoteDto) {
    return this.gameStateService.recordVote(roomId, dto.voterId, dto.targetId);
  }

  @Post(':roomId/resolve-votes')
  @ApiOperation({ summary: 'Resolve votes, eliminate player, advance phase' })
  @ApiParam({ name: 'roomId' })
  resolveVotes(@Param('roomId') roomId: string) {
    return this.gameStateService.resolveVotes(roomId);
  }
}
