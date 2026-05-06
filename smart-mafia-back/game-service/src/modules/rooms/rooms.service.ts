import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Room, RoomStatus, Prisma } from '@prisma/client';
import { CreateRoomDto } from './dto/room.dto';
import { PlayersService } from '../players/players.service';
import { GameStateService } from '../game-state/game-state.service';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly playersService: PlayersService,
    @Inject(forwardRef(() => GameStateService))
    private readonly gameStateService: GameStateService,
  ) {}

  private generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 8 }, () =>
      chars[Math.floor(Math.random() * chars.length)],
    ).join('');
  }

  async create(hostId: string, dto: CreateRoomDto): Promise<Room> {
    let code: string;
    let attempts = 0;

    do {
      code = this.generateCode();
      attempts++;
      if (attempts > 10) throw new BadRequestException('Could not generate unique room code');
    } while (await this.prisma.room.findUnique({ where: { code } }));

    const room = await this.prisma.room.create({
      data: {
        code,
        hostId,
        maxPlayers: dto.maxPlayers ?? 10,
        settings: (dto.settings ?? {}) as Prisma.InputJsonValue,
      },
    });

    // Auto-add host as first player
    await this.prisma.player.create({
      data: { userId: hostId, roomId: room.id },
    });

    return room;
  }

  async findByCode(code: string): Promise<Room & { players: any[] }> {
    const room = await this.prisma.room.findUnique({
      where: { code: code.toUpperCase() },
      include: { players: { include: { user: { select: { username: true } } } } },
    });
    if (!room) throw new NotFoundException(`Room ${code} not found`);
    return room;
  }

  async findById(id: string): Promise<Room> {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException(`Room ${id} not found`);
    return room;
  }

  async listActive(): Promise<Room[]> {
    return this.prisma.room.findMany({
      where: { status: { in: [RoomStatus.WAITING, RoomStatus.IN_PROGRESS] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async startGame(roomId: string, requesterId: string): Promise<Room> {
    const room = await this.findById(roomId);

    if (room.hostId !== requesterId) {
      throw new ForbiddenException('Only host can start the game');
    }

    if (room.status === RoomStatus.IN_PROGRESS) return room;

    if (room.status === RoomStatus.FINISHED) {
      throw new BadRequestException('This game has already finished');
    }

    const playerCount = await this.prisma.player.count({ where: { roomId } });
    if (playerCount < 4) {
      throw new BadRequestException(
        `Need at least 4 players to start (have ${playerCount})`,
      );
    }

    return this.prisma.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.IN_PROGRESS },
    });
  }

  async startGameSession(roomId: string, requesterId: string) {
    const room = await this.startGame(roomId, requesterId);
    await this.playersService.ensureRolesAssigned(roomId);
    const gameState = await this.gameStateService.initGame(roomId);
    return { room, gameState };
  }

  async endGame(roomId: string): Promise<Room> {
    return this.prisma.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.FINISHED },
    });
  }
}
