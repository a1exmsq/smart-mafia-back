import { Body, Controller, Delete, Get, Param, Post, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PlayersService } from './players.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

class JoinRoomDto {
  @ApiProperty({ example: 'MAFIA1234' })
  @IsString()
  roomCode: string;
}

@ApiTags('players')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Post('join')
  @ApiOperation({ summary: 'Join a room by code' })
  @ApiResponse({ status: 201, description: 'Player joined successfully' })
  @ApiResponse({ status: 400, description: 'Room full or already started' })
  @ApiResponse({ status: 409, description: 'Already in this room' })
  join(@Body() dto: JoinRoomDto, @Request() req) {
    return this.playersService.joinRoom(req.user.sub, dto.roomCode);
  }

  @Delete('leave/:roomId')
  @ApiOperation({ summary: 'Leave a room' })
  @ApiParam({ name: 'roomId', description: 'Room UUID' })
  @ApiResponse({ status: 200, description: 'Left room' })
  leave(@Param('roomId') roomId: string, @Request() req) {
    return this.playersService.leaveRoom(req.user.sub, roomId);
  }

  @Get('room/:roomId')
  @ApiOperation({ summary: 'Get all players in a room' })
  @ApiParam({ name: 'roomId' })
  @ApiResponse({ status: 200, description: 'List of players with usernames' })
  getPlayers(@Param('roomId') roomId: string) {
    return this.playersService.getPlayersInRoom(roomId);
  }
}
