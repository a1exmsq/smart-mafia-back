import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MafiaRole, Player, RoomStatus } from '@prisma/client';

type PlayerWithUser = Player & { user: { username: string } };

export type VisibleRoomPlayer = Omit<PlayerWithUser, 'role'> & {
  role: MafiaRole | null;
  user: { username: string };
};

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async joinRoom(userId: string, roomCode: string): Promise<Player> {
    const room = await this.prisma.room.findUnique({
      where: { code: roomCode.toUpperCase() },
    });
    if (!room) throw new NotFoundException(`Room ${roomCode} not found`);
    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException('Game already started or finished');
    }

    const existing = await this.prisma.player.findUnique({
      where: { userId_roomId: { userId, roomId: room.id } },
    });
    if (existing) return existing;

    const count = await this.prisma.player.count({ where: { roomId: room.id } });
    if (count >= room.maxPlayers) throw new BadRequestException('Room is full');

    return this.prisma.player.create({ data: { userId, roomId: room.id } });
  }

  async findPlayerInRoom(userId: string, roomId: string): Promise<Player | null> {
    return this.prisma.player.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });
  }

  async leaveRoom(userId: string, roomId: string): Promise<void> {
    await this.prisma.player.deleteMany({ where: { userId, roomId } });
  }

  async getPlayersInRoom(roomId: string): Promise<PlayerWithUser[]> {
    return this.prisma.player.findMany({
      where: { roomId },
      include: { user: { select: { username: true } } },
    });
  }

  async getVisiblePlayersInRoom(
    roomId: string,
    requesterUserId: string,
  ): Promise<VisibleRoomPlayer[]> {
    const [room, players] = await Promise.all([
      this.prisma.room.findUnique({ where: { id: roomId }, select: { status: true } }),
      this.getPlayersInRoom(roomId),
    ]);

    if (!room) throw new NotFoundException(`Room ${roomId} not found`);

    const gameActive = room.status !== RoomStatus.WAITING;

    return players.map((p) => ({
      ...p,
      // Always show own role once game has started, hide others' roles
      role: gameActive && p.userId === requesterUserId ? p.role : null,
    }));
  }

  async assignRoles(roomId: string): Promise<void> {
    const players = await this.prisma.player.findMany({ where: { roomId } });
    const count = players.length;

    const mafiaCount = Math.max(1, Math.floor(count / 3));
    const roles: MafiaRole[] = [
      ...Array(mafiaCount).fill(MafiaRole.MAFIA),
      MafiaRole.DETECTIVE,
      MafiaRole.DOCTOR,
      ...Array(Math.max(0, count - mafiaCount - 2)).fill(MafiaRole.CIVILIAN),
    ];

    // Fisher-Yates shuffle
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    await Promise.all(
      players.map((p, i) =>
        this.prisma.player.update({ where: { id: p.id }, data: { role: roles[i] } }),
      ),
    );
  }

  async ensureRolesAssigned(roomId: string): Promise<void> {
    const players = await this.prisma.player.findMany({ where: { roomId } });
    const needsRoles = players.every((p) => p.role === MafiaRole.CIVILIAN || p.role === null);
    if (needsRoles) await this.assignRoles(roomId);
  }

  async findPlayerById(
    playerId: string,
  ): Promise<(Player & { user: { username: string } }) | null> {
    return this.prisma.player.findUnique({
      where: { id: playerId },
      include: { user: { select: { username: true } } },
    });
  }

  async eliminatePlayer(playerId: string): Promise<Player> {
    return this.prisma.player.update({
      where: { id: playerId },
      data: { isAlive: false },
    });
  }
}
