import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, RoomResponseDto } from './dto/room.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('rooms')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new game room' })
  @ApiResponse({ status: 201, type: RoomResponseDto })
  create(@Body() dto: CreateRoomDto, @Request() req) {
    return this.roomsService.create(req.user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all active rooms' })
  @ApiResponse({ status: 200, type: [RoomResponseDto] })
  listActive() {
    return this.roomsService.listActive();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get room details by code' })
  @ApiParam({ name: 'code', example: 'MAFIA1234' })
  @ApiResponse({ status: 200, type: RoomResponseDto })
  @ApiResponse({ status: 404, description: 'Room not found' })
  findByCode(@Param('code') code: string) {
    return this.roomsService.findByCode(code);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Start the game (host only)' })
  @ApiParam({ name: 'id', description: 'Room UUID' })
  @ApiResponse({ status: 200, type: RoomResponseDto })
  @ApiResponse({ status: 403, description: 'Only host can start' })
  startGame(@Param('id') id: string, @Request() req) {
    return this.roomsService.startGame(id, req.user.sub);
  }
}
