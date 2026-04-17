import { Body, Controller, Get, Param, Post, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';
import { GameStateService } from './game-state.service';
import { PlayersService } from '../players/players.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GameGateway } from '../../gateway/game.gateway';

class VoteDto {
  @ApiProperty() @IsString() targetId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() voterId?: string;
}

class NightActionDto {
  @ApiProperty({ enum: ['mafia_kill', 'doctor_save', 'detective_check'] })
  @IsIn(['mafia_kill', 'doctor_save', 'detective_check'])
  action: 'mafia_kill' | 'doctor_save' | 'detective_check';

  @ApiProperty() @IsString() targetId: string;
}

@ApiTags('game')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('game')
export class GameStateController {
  constructor(
    private readonly gameStateService: GameStateService,
    private readonly playersService: PlayersService,
    private readonly gateway: GameGateway,
  ) {}

  @Post(':roomId/init')
  @ApiOperation({ summary: 'Initialize game state (phase: INTRO)' })
  @ApiParam({ name: 'roomId' })
  init(@Param('roomId') roomId: string) {
    return this.gameStateService.initGame(roomId);
  }

  @Get(':roomId/state')
  @ApiOperation({ summary: 'Get current game state' })
  @ApiParam({ name: 'roomId' })
  getState(@Param('roomId') roomId: string) {
    return this.gameStateService.getCurrentState(roomId);
  }

  @Post(':roomId/advance')
  @ApiOperation({ summary: 'Advance phase: INTRO→NIGHT→DAY→VOTING→NIGHT→...' })
  @ApiParam({ name: 'roomId' })
  advance(@Param('roomId') roomId: string) {
    return this.gameStateService.advancePhase(roomId);
  }

  @Post(':roomId/vote')
  @ApiOperation({ summary: 'Record day vote (VOTING phase)' })
  @ApiParam({ name: 'roomId' })
  async vote(@Param('roomId') roomId: string, @Body() dto: VoteDto, @Request() req) {
    let voterPlayerId = dto.voterId;
    if (!voterPlayerId) {
      const voter = await this.playersService.findPlayerInRoom(req.user.sub, roomId);
      if (!voter) throw new Error('You are not in this room');
      voterPlayerId = voter.id;
    }

    const state = await this.gameStateService.recordVote(roomId, voterPlayerId, dto.targetId);

    (this.gateway as any).server?.to(roomId).emit('vote_cast', {
      voterId: voterPlayerId,
      targetId: dto.targetId,
      ts: new Date().toISOString(),
    });

    return state;
  }

  @Post(':roomId/resolve-votes')
  @ApiOperation({ summary: 'Resolve votes, eliminate top-voted' })
  @ApiParam({ name: 'roomId' })
  resolveVotes(@Param('roomId') roomId: string) {
    return this.gameStateService.resolveVotes(roomId);
  }

  @Post(':roomId/night-action')
  @ApiOperation({ summary: 'Submit night action (mafia_kill / doctor_save / detective_check)' })
  @ApiParam({ name: 'roomId' })
  async nightAction(@Param('roomId') roomId: string, @Body() dto: NightActionDto, @Request() req) {
    const actor = await this.playersService.findPlayerInRoom(req.user.sub, roomId);
    if (!actor) throw new Error('You are not in this room');

    const result = await this.gameStateService.recordNightAction(
      roomId, actor.id, dto.action, dto.targetId,
    );

    // Detective result is returned ONLY in the HTTP response body (private to the requester).
    // The socket path (game.gateway.ts handleNightAction) already sends it to the correct socket only.
    return { success: true, result: result.result ?? null };
  }
}
