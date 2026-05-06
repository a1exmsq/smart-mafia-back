import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../../common/prisma.service';
import { RoomStatus } from '@prisma/client';

const mockRoom = {
  id: 'room-uuid-1',
  code: 'MAFIA1234',
  hostId: 'host-uuid',
  status: RoomStatus.WAITING,
  maxPlayers: 10,
  settings: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  players: [],
};

const mockPrisma = {
  room: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  player: {
    count: jest.fn(),
  },
};

describe('RoomsService', () => {
  let service: RoomsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
    jest.clearAllMocks();
  });

  // ── create ──────────────────────────────────────────────────────────────────
  describe('create()', () => {
    it('should create a room with a unique 8-char code', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(null); // code is unique
      mockPrisma.room.create.mockResolvedValue(mockRoom);

      const result = await service.create('host-uuid', { maxPlayers: 10 });

      expect(result).toEqual(mockRoom);
      expect(mockPrisma.room.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ hostId: 'host-uuid', maxPlayers: 10 }),
        }),
      );
    });

    it('should retry on code collision and eventually succeed', async () => {
      // First call returns existing room (collision), second is null (free)
      mockPrisma.room.findUnique
        .mockResolvedValueOnce(mockRoom)
        .mockResolvedValue(null);
      mockPrisma.room.create.mockResolvedValue(mockRoom);

      const result = await service.create('host-uuid', {});
      expect(result).toBeDefined();
      expect(mockPrisma.room.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  // ── findByCode ──────────────────────────────────────────────────────────────
  describe('findByCode()', () => {
    it('should return room when found', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(mockRoom);
      const result = await service.findByCode('MAFIA1234');
      expect(result).toEqual(mockRoom);
    });

    it('should throw NotFoundException when room does not exist', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(null);
      await expect(service.findByCode('NOTFOUND')).rejects.toThrow(NotFoundException);
    });

    it('should uppercase the code before lookup', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(mockRoom);
      await service.findByCode('mafia1234');
      expect(mockPrisma.room.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'MAFIA1234' } }),
      );
    });
  });

  // ── startGame ───────────────────────────────────────────────────────────────
  describe('startGame()', () => {
    it('should start game when host requests with enough players', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(mockRoom);
      mockPrisma.player.count.mockResolvedValue(4);
      mockPrisma.room.update.mockResolvedValue({
        ...mockRoom,
        status: RoomStatus.IN_PROGRESS,
      });

      const result = await service.startGame('room-uuid-1', 'host-uuid');
      expect(result.status).toBe(RoomStatus.IN_PROGRESS);
    });

    it('should throw ForbiddenException when non-host tries to start', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(mockRoom);
      await expect(service.startGame('room-uuid-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when fewer than 3 players', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(mockRoom);
      mockPrisma.player.count.mockResolvedValue(2);
      await expect(service.startGame('room-uuid-1', 'host-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when room already IN_PROGRESS', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({
        ...mockRoom,
        status: RoomStatus.IN_PROGRESS,
      });
      await expect(service.startGame('room-uuid-1', 'host-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── listActive ──────────────────────────────────────────────────────────────
  describe('listActive()', () => {
    it('should return rooms in WAITING or IN_PROGRESS state', async () => {
      mockPrisma.room.findMany.mockResolvedValue([mockRoom]);
      const result = await service.listActive();
      expect(result).toHaveLength(1);
      expect(mockPrisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: { in: [RoomStatus.WAITING, RoomStatus.IN_PROGRESS] } },
        }),
      );
    });
  });
});
