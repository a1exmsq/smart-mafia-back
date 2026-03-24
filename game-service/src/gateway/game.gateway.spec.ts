import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GameGateway, EVENTS } from './game.gateway';
import { RoomsService } from '../modules/rooms/rooms.service';
import { PlayersService } from '../modules/players/players.service';
import { GameStateService } from '../modules/game-state/game-state.service';

// Minimal mock socket
const mockSocket = (token = 'valid.jwt.token') => ({
  id: 'socket-123',
  userId: undefined as any,
  username: undefined as any,
  roomId: undefined as any,
  handshake: { auth: { token }, headers: {} },
  emit: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
  to: jest.fn().mockReturnThis(),
  disconnect: jest.fn(),
});

const mockJwtService = {
  verify: jest.fn().mockReturnValue({ sub: 'user-1', username: 'alice', role: 'PLAYER' }),
  sign: jest.fn().mockReturnValue('token'),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test_secret'),
};

const mockRoomsService = {
  findByCode: jest.fn(),
  findById: jest.fn(),
  startGame: jest.fn(),
};

const mockPlayersService = {
  joinRoom: jest.fn(),
  leaveRoom: jest.fn(),
  getPlayersInRoom: jest.fn(),
  assignRoles: jest.fn(),
};

const mockGameStateService = {
  initGame: jest.fn(),
  recordVote: jest.fn(),
  getCurrentState: jest.fn(),
};

describe('GameGateway', () => {
  let gateway: GameGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RoomsService, useValue: mockRoomsService },
        { provide: PlayersService, useValue: mockPlayersService },
        { provide: GameStateService, useValue: mockGameStateService },
      ],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);
    // Mock server
    (gateway as any).server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      in: jest.fn().mockReturnThis(),
      fetchSockets: jest.fn().mockResolvedValue([]),
    };
    jest.clearAllMocks();
  });

  // ── handleConnection ────────────────────────────────────────────────────────
  describe('handleConnection()', () => {
    it('should authenticate and set userId/username on socket', async () => {
      const client = mockSocket() as any;
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', username: 'alice', role: 'PLAYER' });

      await gateway.handleConnection(client);

      expect(client.userId).toBe('user-1');
      expect(client.username).toBe('alice');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect socket when no token provided', async () => {
      const client = mockSocket('') as any;
      client.handshake.auth = {};

      await gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith(EVENTS.ERROR, expect.objectContaining({ message: 'Unauthorized' }));
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect when JWT verification fails', async () => {
      const client = mockSocket('bad.token') as any;
      mockJwtService.verify.mockImplementation(() => { throw new Error('invalid'); });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  // ── handleJoinRoom ──────────────────────────────────────────────────────────
  describe('handleJoinRoom()', () => {
    it('should join socket room and emit ROOM_JOINED on success', async () => {
      const client = { ...mockSocket(), userId: 'user-1', username: 'alice', roomId: undefined } as any;
      const room = {
        id: 'room-1', code: 'MAFIA1234', hostId: 'host-1',
        players: [], status: 'WAITING', maxPlayers: 10, settings: {}, createdAt: new Date(), updatedAt: new Date(),
      };
      mockPlayersService.joinRoom.mockResolvedValue({ id: 'player-1', userId: 'user-1', roomId: 'room-1' });
      mockRoomsService.findByCode.mockResolvedValue(room);

      await gateway.handleJoinRoom(client, { roomCode: 'MAFIA1234' });

      expect(client.join).toHaveBeenCalledWith('room-1');
      expect(client.emit).toHaveBeenCalledWith(EVENTS.ROOM_JOINED, expect.objectContaining({ roomCode: 'MAFIA1234' }));
      expect(client.roomId).toBe('room-1');
    });

    it('should emit ERROR when joinRoom fails', async () => {
      const client = { ...mockSocket(), userId: 'user-1', username: 'alice' } as any;
      mockPlayersService.joinRoom.mockRejectedValue(new Error('Room full'));

      await gateway.handleJoinRoom(client, { roomCode: 'MAFIA1234' });

      expect(client.emit).toHaveBeenCalledWith(EVENTS.ERROR, { message: 'Room full' });
    });
  });

  // ── handleChatMessage ───────────────────────────────────────────────────────
  describe('handleChatMessage()', () => {
    it('should broadcast CHAT_MESSAGE to room', () => {
      const client = { ...mockSocket(), userId: 'user-1', username: 'alice', roomId: 'room-1' } as any;

      gateway.handleChatMessage(client, { text: 'Hello everyone!' });

      expect((gateway as any).server.to).toHaveBeenCalledWith('room-1');
    });

    it('should ignore empty messages', () => {
      const client = { ...mockSocket(), userId: 'user-1', username: 'alice', roomId: 'room-1' } as any;

      gateway.handleChatMessage(client, { text: '   ' });

      expect((gateway as any).server.to).not.toHaveBeenCalled();
    });

    it('should not broadcast if client has no roomId', () => {
      const client = { ...mockSocket(), userId: 'user-1', username: 'alice', roomId: undefined } as any;

      gateway.handleChatMessage(client, { text: 'Hello' });

      expect((gateway as any).server.to).not.toHaveBeenCalled();
    });
  });

  // ── handleVote ──────────────────────────────────────────────────────────────
  describe('handleVote()', () => {
    it('should record vote and broadcast VOTE_CAST event', async () => {
      const client = { ...mockSocket(), userId: 'user-1', username: 'alice', roomId: 'room-1' } as any;
      mockGameStateService.recordVote.mockResolvedValue({});

      await gateway.handleVote(client, { voterId: 'p1', targetId: 'p2' });

      expect(mockGameStateService.recordVote).toHaveBeenCalledWith('room-1', 'p1', 'p2');
    });
  });
});
