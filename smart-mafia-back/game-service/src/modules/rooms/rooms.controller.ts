import { Body, Controller, Get, Param, Post, Patch, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, RoomResponseDto } from './dto/room.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GameGateway } from '../../gateway/game.gateway';

@ApiTags('rooms')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly gateway: GameGateway,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new game room' })
  @ApiResponse({ status: 201, type: RoomResponseDto })
  create(@Body() dto: CreateRoomDto, @Request() req) {
    return this.roomsService.create(req.user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all active rooms' })
  listActive() {
    return this.roomsService.listActive();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get room by code' })
  @ApiParam({ name: 'code' })
  findByCode(@Param('code') code: string) {
    return this.roomsService.findByCode(code);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Start the game (host only)' })
  @ApiParam({ name: 'id' })
  async startGame(@Param('id') id: string, @Request() req) {
    const session = await this.roomsService.startGameSession(id, req.user.sub);
    // Broadcast game_started + private roles to all connected sockets
    await this.gateway.sendRolesAndBroadcast(id, session.gameState);
    return session;
  }
}
