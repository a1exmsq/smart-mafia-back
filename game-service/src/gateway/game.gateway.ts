import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WsException,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RoomsService } from '../modules/rooms/rooms.service';
import { PlayersService } from '../modules/players/players.service';
import { GameStateService } from '../modules/game-state/game-state.service';

// ── Socket event constants ─────────────────────────────────────────────────────
export const EVENTS = {
  // Client → Server
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  SEND_MESSAGE: 'send_message',
  CAST_VOTE: 'cast_vote',
  READY: 'player_ready',
  REQUEST_AI: 'request_ai_narration',

  // Server → Client
  ROOM_JOINED: 'room_joined',
  ROOM_LEFT: 'room_left',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  GAME_STARTED: 'game_started',
  PHASE_CHANGED: 'phase_changed',
  VOTE_CAST: 'vote_cast',
  PLAYER_ELIMINATED: 'player_eliminated',
  GAME_OVER: 'game_over',
  CHAT_MESSAGE: 'chat_message',
  AI_NARRATION: 'ai_narration',
  ERROR: 'error',
} as const;

interface AuthenticatedSocket extends Socket {
  userId: string;
  username: string;
  roomId?: string;
}

@WebSocketGateway({
  cors: { origin: '*', methods: ['GET', 'POST'] },
  namespace: '/game',
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);

  // Track readiness: roomId → Set of ready userIds
  private readyPlayers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly roomsService: RoomsService,
    private readonly playersService: PlayersService,
    private readonly gameStateService: GameStateService,
  ) {}

  afterInit() {
    this.logger.log(`🔌 Socket.io Gateway listening on port ${process.env.SOCKET_PORT || 3012}`);
  }

  // ── Connection / Auth ──────────────────────────────────────────────────────

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) throw new WsException('Missing auth token');

      const payload = this.jwtService.verify(token, {
        secret: this.config.get('JWT_SECRET'),
      });

      client.userId = payload.sub;
      client.username = payload.username;
      this.logger.log(`✅ Connected: ${client.username} (${client.id})`);
    } catch (err) {
      this.logger.warn(`❌ Unauthorized connection: ${client.id}`);
      client.emit(EVENTS.ERROR, { message: 'Unauthorized' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Disconnected: ${client.username ?? client.id}`);

    if (client.roomId) {
      client.to(client.roomId).emit(EVENTS.PLAYER_LEFT, {
        userId: client.userId,
        username: client.username,
      });

      // Remove from ready set
      this.readyPlayers.get(client.roomId)?.delete(client.userId);
    }
  }

  // ── Events: Room ───────────────────────────────────────────────────────────

  @SubscribeMessage(EVENTS.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomCode: string },
  ) {
    try {
      const player = await this.playersService.joinRoom(client.userId, data.roomCode);
      const room = await this.roomsService.findByCode(data.roomCode);

      client.roomId = room.id;
      client.join(room.id);

      // Notify others
      client.to(room.id).emit(EVENTS.PLAYER_JOINED, {
        userId: client.userId,
        username: client.username,
        playerId: player.id,
      });

      // Confirm join to requester
      client.emit(EVENTS.ROOM_JOINED, {
        roomId: room.id,
        roomCode: room.code,
        players: room.players,
        hostId: room.hostId,
      });

      this.logger.log(`${client.username} joined room ${room.code}`);
    } catch (err) {
      client.emit(EVENTS.ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(EVENTS.LEAVE_ROOM)
  async handleLeaveRoom(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.roomId) return;

    await this.playersService.leaveRoom(client.userId, client.roomId);
    client.to(client.roomId).emit(EVENTS.PLAYER_LEFT, {
      userId: client.userId,
      username: client.username,
    });
    client.leave(client.roomId);
    client.emit(EVENTS.ROOM_LEFT, { roomId: client.roomId });
    client.roomId = undefined;
  }

  // ── Events: Chat ───────────────────────────────────────────────────────────

  @SubscribeMessage(EVENTS.SEND_MESSAGE)
  handleChatMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { text: string },
  ) {
    if (!client.roomId) return;
    if (!data.text?.trim()) return;

    this.server.to(client.roomId).emit(EVENTS.CHAT_MESSAGE, {
      from: client.username,
      userId: client.userId,
      text: data.text.trim().slice(0, 500), // sanitize length
      ts: new Date().toISOString(),
    });
  }

  // ── Events: Ready / Start ──────────────────────────────────────────────────

  @SubscribeMessage(EVENTS.READY)
  async handleReady(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.roomId) return;

    if (!this.readyPlayers.has(client.roomId)) {
      this.readyPlayers.set(client.roomId, new Set());
    }
    this.readyPlayers.get(client.roomId)!.add(client.userId);

    const room = await this.roomsService.findById(client.roomId);
    const totalPlayers = await this.playersService.getPlayersInRoom(client.roomId);
    const readyCount = this.readyPlayers.get(client.roomId)!.size;

    // Broadcast ready count
    this.server.to(client.roomId).emit('ready_update', {
      ready: readyCount,
      total: totalPlayers.length,
    });

    // Auto-start when all players ready and host triggered start
    if (readyCount === totalPlayers.length && room.hostId === client.userId) {
      await this.startGame(client.roomId, client.userId);
    }
  }

  // ── Events: Voting ─────────────────────────────────────────────────────────

  @SubscribeMessage(EVENTS.CAST_VOTE)
  async handleVote(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { targetId: string; voterId: string },
  ) {
    if (!client.roomId) return;

    try {
      await this.gameStateService.recordVote(client.roomId, data.voterId, data.targetId);

      this.server.to(client.roomId).emit(EVENTS.VOTE_CAST, {
        voterId: data.voterId,
        targetId: data.targetId,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      client.emit(EVENTS.ERROR, { message: err.message });
    }
  }

  // ── Events: AI Narration request ───────────────────────────────────────────

  @SubscribeMessage(EVENTS.REQUEST_AI)
  async handleAiNarration(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { prompt: string },
  ) {
    if (!client.roomId) return;

    // Forward to AI service via HTTP and broadcast result
    try {
      const response = await fetch(`${process.env.AI_SERVICE_URL}/ai/narrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: data.prompt, roomId: client.roomId }),
      });

      const result = await response.json();

      this.server.to(client.roomId).emit(EVENTS.AI_NARRATION, {
        text: result.narration,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      client.emit(EVENTS.ERROR, { message: 'AI service unavailable' });
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private async startGame(roomId: string, hostId: string) {
    await this.roomsService.startGame(roomId, hostId);
    await this.playersService.assignRoles(roomId);
    const gameState = await this.gameStateService.initGame(roomId);

    // Fetch players with roles to send private role info
    const players = await this.playersService.getPlayersInRoom(roomId);

    // Broadcast public game start event
    this.server.to(roomId).emit(EVENTS.GAME_STARTED, {
      gameState,
      message: 'Game has started! Check your private role.',
    });

    // Send each player their secret role privately
    const roomSockets = await this.server.in(roomId).fetchSockets();
    for (const socket of roomSockets) {
      const s = socket as unknown as AuthenticatedSocket;
      const playerData = players.find((p) => p.userId === s.userId);
      if (playerData) {
        socket.emit('your_role', { role: playerData.role, playerId: playerData.id });
      }
    }

    this.readyPlayers.delete(roomId);
    this.logger.log(`🎮 Game started in room ${roomId}`);
  }

  // Called by GameStateService indirectly via controller
  emitPhaseChange(roomId: string, phase: string, round: number) {
    this.server.to(roomId).emit(EVENTS.PHASE_CHANGED, { phase, round, ts: new Date().toISOString() });
  }

  emitPlayerEliminated(roomId: string, playerId: string, username: string) {
    this.server.to(roomId).emit(EVENTS.PLAYER_ELIMINATED, { playerId, username });
  }

  emitGameOver(roomId: string, winner: string) {
    this.server.to(roomId).emit(EVENTS.GAME_OVER, { winner, ts: new Date().toISOString() });
  }
}
