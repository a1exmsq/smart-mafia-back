import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MafiaRole, Player, RoomStatus } from '@prisma/client';

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async joinRoom(userId: string, roomCode: string): Promise<Player> {
    const room = await this.prisma.room.findUnique({ where: { code: roomCode.toUpperCase() } });
    if (!room) throw new NotFoundException(`Room ${roomCode} not found`);
    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException('Game already started or finished');
    }

    const existing = await this.prisma.player.findUnique({
      where: { userId_roomId: { userId, roomId: room.id } },
    });
    if (existing) throw new ConflictException('Already in this room');

    const count = await this.prisma.player.count({ where: { roomId: room.id } });
    if (count >= room.maxPlayers) throw new BadRequestException('Room is full');

    return this.prisma.player.create({ data: { userId, roomId: room.id } });
  }

  async leaveRoom(userId: string, roomId: string): Promise<void> {
    await this.prisma.player.deleteMany({ where: { userId, roomId } });
  }

  async getPlayersInRoom(roomId: string): Promise<Player[]> {
    return this.prisma.player.findMany({
      where: { roomId },
      include: { user: { select: { username: true } } },
    });
  }

  // ── Role assignment (called when game starts) ─────────────────────────────
  async assignRoles(roomId: string): Promise<void> {
    const players = await this.prisma.player.findMany({ where: { roomId } });
    const count = players.length;

    // Role distribution: ~1/3 mafia, 1 detective, 1 doctor, rest civilians
    const mafiaCount = Math.max(1, Math.floor(count / 3));
    const roles: MafiaRole[] = [
      ...Array(mafiaCount).fill(MafiaRole.MAFIA),
      MafiaRole.DETECTIVE,
      MafiaRole.DOCTOR,
      ...Array(Math.max(0, count - mafiaCount - 2)).fill(MafiaRole.CIVILIAN),
    ];

    // Shuffle
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    await Promise.all(
      players.map((player, idx) =>
        this.prisma.player.update({
          where: { id: player.id },
          data: { role: roles[idx] },
        }),
      ),
    );
  }

  async eliminatePlayer(playerId: string): Promise<Player> {
    return this.prisma.player.update({
      where: { id: playerId },
      data: { isAlive: false },
    });
  }
}
