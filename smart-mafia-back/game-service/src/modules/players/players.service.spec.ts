import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PlayersService } from './players.service';
import { PrismaService } from '../../common/prisma.service';
import { MafiaRole, RoomStatus } from '@prisma/client';

const mockRoom = {
  id: 'room-1',
  code: 'MAFIA1234',
  hostId: 'host-1',
  status: RoomStatus.WAITING,
  maxPlayers: 5,
  settings: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makePlayer = (override = {}) => ({
  id: 'player-1',
  userId: 'user-1',
  roomId: 'room-1',
  role: MafiaRole.CIVILIAN,
  isAlive: true,
  joinedAt: new Date(),
  ...override,
});

const mockPrisma = {
  room: { findUnique: jest.fn() },
  player: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('PlayersService', () => {
  let service: PlayersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PlayersService>(PlayersService);
    jest.clearAllMocks();
  });

  // ── joinRoom ─────────────────────────────────────────────────────────────────
  describe('joinRoom()', () => {
    it('should create a player when room is open and has space', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(mockRoom);
      mockPrisma.player.findUnique.mockResolvedValue(null);
      mockPrisma.player.count.mockResolvedValue(3);
      mockPrisma.player.create.mockResolvedValue(makePlayer());

      const result = await service.joinRoom('user-1', 'MAFIA1234');
      expect(result.userId).toBe('user-1');
      expect(mockPrisma.player.create).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when room code is invalid', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(null);
      await expect(service.joinRoom('user-1', 'INVALID')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when game already started', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({
        ...mockRoom,
        status: RoomStatus.IN_PROGRESS,
      });
      await expect(service.joinRoom('user-1', 'MAFIA1234')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException when player already in room', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(mockRoom);
      mockPrisma.player.findUnique.mockResolvedValue(makePlayer());
      await expect(service.joinRoom('user-1', 'MAFIA1234')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException when room is full', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(mockRoom); // maxPlayers = 5
      mockPrisma.player.findUnique.mockResolvedValue(null);
      mockPrisma.player.count.mockResolvedValue(5); // already full
      await expect(service.joinRoom('user-2', 'MAFIA1234')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── assignRoles ──────────────────────────────────────────────────────────────
  describe('assignRoles()', () => {
    it('should assign roles to all players', async () => {
      const players = Array.from({ length: 6 }, (_, i) =>
        makePlayer({ id: `player-${i}`, userId: `user-${i}` }),
      );
      mockPrisma.player.findMany.mockResolvedValue(players);
      mockPrisma.player.update.mockResolvedValue({});

      await service.assignRoles('room-1');

      expect(mockPrisma.player.update).toHaveBeenCalledTimes(6);
    });

    it('should always include at least 1 MAFIA role', async () => {
      const players = Array.from({ length: 3 }, (_, i) =>
        makePlayer({ id: `player-${i}` }),
      );
      mockPrisma.player.findMany.mockResolvedValue(players);

      const assignedRoles: MafiaRole[] = [];
      mockPrisma.player.update.mockImplementation(({ data }) => {
        assignedRoles.push(data.role);
        return Promise.resolve({});
      });

      await service.assignRoles('room-1');

      expect(assignedRoles.filter((r) => r === MafiaRole.MAFIA).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── leaveRoom ────────────────────────────────────────────────────────────────
  describe('leaveRoom()', () => {
    it('should delete the player record', async () => {
      mockPrisma.player.deleteMany.mockResolvedValue({ count: 1 });
      await service.leaveRoom('user-1', 'room-1');
      expect(mockPrisma.player.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', roomId: 'room-1' },
      });
    });
  });

  // ── eliminatePlayer ──────────────────────────────────────────────────────────
  describe('eliminatePlayer()', () => {
    it('should set isAlive to false', async () => {
      const eliminated = makePlayer({ isAlive: false });
      mockPrisma.player.update.mockResolvedValue(eliminated);

      const result = await service.eliminatePlayer('player-1');
      expect(result.isAlive).toBe(false);
      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: 'player-1' },
        data: { isAlive: false },
      });
    });
  });
});
