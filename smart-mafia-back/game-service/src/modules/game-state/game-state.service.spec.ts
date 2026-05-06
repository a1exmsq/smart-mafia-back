import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GameStateService, GameSnapshot } from './game-state.service';
import { PrismaService } from '../../common/prisma.service';
import { GamePhase, MafiaRole, RoomStatus } from '@prisma/client';

const makeState = (override: Partial<any> = {}) => ({
  id: 'state-1',
  roomId: 'room-1',
  phase: GamePhase.DAY,
  round: 1,
  createdAt: new Date(),
  snapshot: {
    phase: 'DAY',
    round: 1,
    alivePlayers: [
      { id: 'p1', username: 'Alice' },
      { id: 'p2', username: 'Bob' },
      { id: 'p3', username: 'Charlie' },
    ],
    votes: {},
    winner: null,
  },
  ...override,
});

const mockPrisma = {
  gameState: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  player: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  room: {
    update: jest.fn(),
  },
};

describe('GameStateService', () => {
  let service: GameStateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameStateService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GameStateService>(GameStateService);
    jest.clearAllMocks();
  });

  describe('initGame()', () => {
    it('should create initial game state with DAY phase and round 1', async () => {
      const players = [
        { id: 'p1', user: { username: 'Alice' } },
        { id: 'p2', user: { username: 'Bob' } },
      ];
      mockPrisma.player.findMany.mockResolvedValue(players);
      mockPrisma.gameState.create.mockResolvedValue(makeState());

      const result = await service.initGame('room-1');
      expect(result.phase).toBe(GamePhase.DAY);
      expect(result.round).toBe(1);
    });
  });

  describe('getCurrentState()', () => {
    it('should return the latest state', async () => {
      mockPrisma.gameState.findFirst.mockResolvedValue(makeState());
      const result = await service.getCurrentState('room-1');
      expect(result.roomId).toBe('room-1');
    });

    it('should throw NotFoundException when no state', async () => {
      mockPrisma.gameState.findFirst.mockResolvedValue(null);
      await expect(service.getCurrentState('room-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('advancePhase()', () => {
    it('should advance from DAY to VOTING', async () => {
      mockPrisma.gameState.findFirst.mockResolvedValue(makeState({ phase: GamePhase.DAY }));
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 'p1', role: MafiaRole.CIVILIAN, user: { username: 'Alice' } },
        { id: 'p2', role: MafiaRole.CIVILIAN, user: { username: 'Bob' } },
        { id: 'p3', role: MafiaRole.MAFIA, user: { username: 'Charlie' } },
      ]);
      mockPrisma.gameState.create.mockResolvedValue(makeState({ phase: GamePhase.VOTING }));

      const result = await service.advancePhase('room-1');
      expect(result.phase).toBe(GamePhase.VOTING);
    });
  });

  describe('recordVote()', () => {
    it('should record a vote', async () => {
      const state = makeState();
      mockPrisma.gameState.findFirst.mockResolvedValue(state);
      mockPrisma.gameState.update.mockResolvedValue({
        ...state,
        snapshot: { ...state.snapshot, votes: { 'p1': 'p2' } },
      });

      const result = await service.recordVote('room-1', 'p1', 'p2');
      const snap = result.snapshot as unknown as GameSnapshot;
      expect(snap.votes?.['p1']).toBe('p2');
    });
  });

  describe('resolveVotes()', () => {
    it('should eliminate player with most votes', async () => {
      const state = makeState({
        snapshot: {
          phase: 'VOTING', round: 1,
          alivePlayers: [],
          votes: { 'p1': 'p3', 'p2': 'p3' },
          winner: null,
        },
      });
      mockPrisma.gameState.findFirst.mockResolvedValue(state);
      mockPrisma.player.update.mockResolvedValue({});
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 'p1', role: MafiaRole.CIVILIAN, user: { username: 'Alice' } },
        { id: 'p2', role: MafiaRole.CIVILIAN, user: { username: 'Bob' } },
      ]);
      mockPrisma.gameState.create.mockResolvedValue(makeState({ phase: GamePhase.NIGHT }));

      const { eliminated } = await service.resolveVotes('room-1');
      expect(eliminated).toBe('p3');
    });
  });
});
