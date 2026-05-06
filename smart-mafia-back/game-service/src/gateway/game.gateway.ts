import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection,
  OnGatewayDisconnect, OnGatewayInit, WsException,
} from '@nestjs/websockets';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RoomStatus } from '@prisma/client';
import { RoomsService } from '../modules/rooms/rooms.service';
import { PlayersService } from '../modules/players/players.service';
import { GameStateService } from '../modules/game-state/game-state.service';

export const EVENTS = {
  JOIN_ROOM: 'join_room', LEAVE_ROOM: 'leave_room',
  SEND_MESSAGE: 'send_message', CAST_VOTE: 'cast_vote',
  NIGHT_ACTION: 'night_action', READY: 'player_ready',
  REQUEST_AI: 'request_ai_narration',
  ROOM_JOINED: 'room_joined', ROOM_LEFT: 'room_left',
  PLAYER_JOINED: 'player_joined', PLAYER_LEFT: 'player_left',
  GAME_STARTED: 'game_started', PHASE_CHANGED: 'phase_changed',
  VOTE_CAST: 'vote_cast', PLAYER_ELIMINATED: 'player_eliminated',
  GAME_OVER: 'game_over', CHAT_MESSAGE: 'chat_message',
  AI_NARRATION: 'ai_narration', SYSTEM_MESSAGE: 'system_message',
  DETECTIVE_RESULT: 'detective_result', RUNOFF_VOTE: 'runoff_vote',
  FINAL_ROLES: 'final_roles',
  // Day-phase nomination & speech timer
  NOMINATE: 'nominate',
  NOMINATION_UPDATED: 'nomination_updated',
  START_SPEECH_TIMER: 'start_speech_timer',
  SPEECH_TIMER_STARTED: 'speech_timer_started',
  SPEECH_TIMER_STOPPED: 'speech_timer_stopped',
  ERROR: 'error',
} as const;

interface AuthSocket extends Socket {
  userId: string;
  username: string;
  roomId?: string;
  avatar?: string;
}

type NarrationEventType =
  | 'game_start'
  | 'day_phase'
  | 'voting_phase'
  | 'night_phase'
  | 'player_eliminated'
  | 'game_over'
  | 'custom';

interface AutomatedNarrationPayload {
  event: NarrationEventType;
  context?: string;
  round?: number;
  playerNames?: string[];
}

@WebSocketGateway({ cors: { origin: '*', methods: ['GET', 'POST'] }, namespace: '/game' })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(GameGateway.name);
  private readyPlayers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => RoomsService)) private readonly roomsService: RoomsService,
    @Inject(forwardRef(() => PlayersService)) private readonly playersService: PlayersService,
    @Inject(forwardRef(() => GameStateService)) private readonly gameStateService: GameStateService,
  ) {}

  afterInit() { this.logger.log('🔌 Gateway initialized on /game'); }

  async handleConnection(client: AuthSocket) {
    try {
      const token = client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) throw new WsException('Missing token');
      const payload = this.jwtService.verify(token, { secret: this.config.get('JWT_SECRET') });
      client.userId = payload.sub;
      client.username = payload.username;
      this.logger.log(`✅ CONNECTED: ${client.username} [${client.id}]`);
    } catch (err) {
      this.logger.warn(`❌ AUTH FAILED [${client.id}]: ${err?.message}`);
      client.emit(EVENTS.ERROR, { message: 'session_expired' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthSocket) {
    this.logger.log(`🔌 DISCONNECTED: ${client.username ?? client.id} (room: ${client.roomId ?? 'none'})`);
    if (client.roomId) {
      client.to(client.roomId).emit(EVENTS.PLAYER_LEFT, {
        userId: client.userId, username: client.username,
      });
      this.readyPlayers.get(client.roomId)?.delete(client.userId);
    }
  }

  @SubscribeMessage(EVENTS.JOIN_ROOM)
  async handleJoinRoom(@ConnectedSocket() c: AuthSocket, @MessageBody() data: { roomCode: string; avatar?: string }) {
    this.logger.log(`JOIN_ROOM: ${c.username} → code=${data?.roomCode}`);
    if (data?.avatar) c.avatar = data.avatar;
    try {
      const room = await this.roomsService.findByCode(data.roomCode);
      let player = await this.playersService.findPlayerInRoom(c.userId, room.id);
      if (!player) {
        if (room.status !== RoomStatus.WAITING) {
          c.emit(EVENTS.ERROR, { message: 'Game already started or finished' }); return;
        }
        player = await this.playersService.joinRoom(c.userId, data.roomCode);
        c.to(room.id).emit(EVENTS.PLAYER_JOINED, {
          userId: c.userId, username: c.username, playerId: player.id,
          avatar: c.avatar || '🎭',
        });
      }
      c.roomId = room.id;
      c.join(room.id);
      this.logger.log(`ROOM_JOINED: ${c.username} → roomId=${room.id} status=${room.status}`);
      c.emit(EVENTS.ROOM_JOINED, { roomId: room.id, roomCode: room.code, hostId: room.hostId });
      if (room.status === RoomStatus.IN_PROGRESS) {
        const state = await this.gameStateService.findCurrentState(room.id);
        if (state) {
          this.logger.log(`SEND_STATE: phase=${state.phase} round=${(state as any).round} → ${c.username}`);
          c.emit(EVENTS.GAME_STARTED, { gameState: state });
        } else {
          this.logger.warn(`NO GAME STATE found for room ${room.id}!`);
        }
        c.emit('your_role', { role: player.role, playerId: player.id });
      }
    } catch (err) {
      this.logger.error(`JOIN_ROOM error for ${c.username}: ${err.message}`);
      c.emit(EVENTS.ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(EVENTS.LEAVE_ROOM)
  async handleLeaveRoom(@ConnectedSocket() c: AuthSocket) {
    if (!c.roomId) return;
    c.to(c.roomId).emit(EVENTS.PLAYER_LEFT, { userId: c.userId, username: c.username });
    c.leave(c.roomId);
    c.emit(EVENTS.ROOM_LEFT, { roomId: c.roomId });
    c.roomId = undefined;
  }

  @SubscribeMessage(EVENTS.SEND_MESSAGE)
  handleChat(@ConnectedSocket() c: AuthSocket, @MessageBody() data: { text: string }) {
    if (!c.roomId || !data.text?.trim()) return;
    this.server.to(c.roomId).emit(EVENTS.CHAT_MESSAGE, {
      from: c.username, userId: c.userId,
      text: data.text.trim().slice(0, 500), ts: new Date().toISOString(),
    });
  }

  @SubscribeMessage(EVENTS.CAST_VOTE)
  async handleVote(@ConnectedSocket() c: AuthSocket, @MessageBody() data: { targetId: string }) {
    if (!c.roomId) {
      this.logger.warn(`VOTE: ${c.username} has no roomId — not joined yet`);
      c.emit(EVENTS.ERROR, { message: 'Not joined to a room. Please refresh.' });
      return;
    }
    this.logger.log(`VOTE: ${c.username} → target=${data?.targetId}`);
    try {
      const voter = await this.playersService.findPlayerInRoom(c.userId, c.roomId);
      if (!voter) { c.emit(EVENTS.ERROR, { message: 'Not in room' }); return; }
      await this.gameStateService.recordVote(c.roomId, voter.id, data.targetId);
      this.server.to(c.roomId).emit(EVENTS.VOTE_CAST, {
        voterId: voter.id, targetId: data.targetId, ts: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.error(`VOTE error: ${err.message}`);
      c.emit(EVENTS.ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(EVENTS.NIGHT_ACTION)
  async handleNightAction(
    @ConnectedSocket() c: AuthSocket,
    @MessageBody() data: { action: 'mafia_kill' | 'doctor_save' | 'detective_check'; targetId: string },
  ) {
    if (!c.roomId) {
      this.logger.warn(`NIGHT_ACTION: ${c.username} has no roomId — not joined yet`);
      c.emit(EVENTS.ERROR, { message: 'Not joined to a room. Please refresh.' });
      return;
    }
    this.logger.log(`NIGHT_ACTION: ${c.username} action=${data?.action} target=${data?.targetId}`);
    try {
      const actor = await this.playersService.findPlayerInRoom(c.userId, c.roomId);
      if (!actor) { c.emit(EVENTS.ERROR, { message: 'Not in room' }); return; }
      const result = await this.gameStateService.recordNightAction(
        c.roomId, actor.id, data.action, data.targetId,
      );
      this.logger.log(`NIGHT_ACTION confirmed: ${c.username} action=${data.action}`);
      c.emit('night_action_confirmed', { action: data.action, targetId: data.targetId });
      if (data.action === 'detective_check' && result.result) {
        const targetPlayer = await this.playersService.findPlayerById(data.targetId);
        c.emit(EVENTS.DETECTIVE_RESULT, {
          targetId: data.targetId,
          targetName: targetPlayer?.user?.username ?? '',
          result: result.result,
          ts: new Date().toISOString(),
        });
      }
      if (data.action === 'mafia_kill') {
        const sockets = await this.server.in(c.roomId).fetchSockets();
        for (const sock of sockets) {
          const s = sock as unknown as AuthSocket;
          if (s.userId === c.userId) continue;
          const p = await this.playersService.findPlayerInRoom(s.userId, c.roomId);
          if (p?.role === 'MAFIA') {
            sock.emit('mafia_vote_update', { voterId: actor.id, targetId: data.targetId });
          }
        }
      }
    } catch (err) {
      this.logger.error(`NIGHT_ACTION error for ${c.username}: ${err.message}`);
      c.emit(EVENTS.ERROR, { message: err.message });
    }
  }

  @SubscribeMessage(EVENTS.READY)
  async handleReady(@ConnectedSocket() c: AuthSocket) {
    if (!c.roomId) return;
    if (!this.readyPlayers.has(c.roomId)) this.readyPlayers.set(c.roomId, new Set());
    this.readyPlayers.get(c.roomId)!.add(c.userId);
    const [room, total] = await Promise.all([
      this.roomsService.findById(c.roomId),
      this.playersService.getPlayersInRoom(c.roomId),
    ]);
    const readyCount = this.readyPlayers.get(c.roomId)!.size;
    this.server.to(c.roomId).emit('ready_update', { ready: readyCount, total: total.length });
    if (readyCount === total.length && room.hostId === c.userId) {
      await this.triggerGameStart(c.roomId, c.userId);
    }
  }

  // ── Nomination (day phase) ────────────────────────────────────────────────

  @SubscribeMessage(EVENTS.NOMINATE)
  async handleNominate(
    @ConnectedSocket() c: AuthSocket,
    @MessageBody() data: { targetId: string | null },
  ) {
    if (!c.roomId) { c.emit(EVENTS.ERROR, { message: 'Not in room' }); return; }
    try {
      const actor = await this.playersService.findPlayerInRoom(c.userId, c.roomId);
      if (!actor?.isAlive) { c.emit(EVENTS.ERROR, { message: 'Eliminated players cannot nominate' }); return; }
      this.logger.log(`NOMINATE: ${c.username} → ${data?.targetId ?? 'withdraw'}`);
      // null targetId = withdraw own nomination
      this.server.to(c.roomId).emit(EVENTS.NOMINATION_UPDATED, {
        nominatorId: actor.id,
        nominatorName: c.username,
        targetId: data.targetId ?? null,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.error(`NOMINATE error: ${err.message}`);
      c.emit(EVENTS.ERROR, { message: err.message });
    }
  }

  // ── Speech timer (host only) ───────────────────────────────────────────────

  @SubscribeMessage(EVENTS.START_SPEECH_TIMER)
  async handleSpeechTimer(
    @ConnectedSocket() c: AuthSocket,
    @MessageBody() data: { playerId: string; seconds?: number; stop?: boolean },
  ) {
    if (!c.roomId) return;
    try {
      const room = await this.roomsService.findById(c.roomId);
      if (room.hostId !== c.userId) {
        c.emit(EVENTS.ERROR, { message: 'Only host can control the timer' }); return;
      }
      if (data.stop) {
        this.logger.log(`TIMER STOP: host ${c.username}`);
        this.server.to(c.roomId).emit(EVENTS.SPEECH_TIMER_STOPPED, {});
        return;
      }
      const secs = Math.min(Math.max(data.seconds ?? 60, 10), 180);
      this.logger.log(`TIMER START: host ${c.username} → player=${data.playerId} seconds=${secs}`);
      this.server.to(c.roomId).emit(EVENTS.SPEECH_TIMER_STARTED, {
        playerId: data.playerId,
        seconds: secs,
        ts: new Date().toISOString(),
      });
    } catch (err) { c.emit(EVENTS.ERROR, { message: err.message }); }
  }

  @SubscribeMessage(EVENTS.REQUEST_AI)
  async handleAiNarration(@ConnectedSocket() c: AuthSocket, @MessageBody() data: { prompt: string }) {
    if (!c.roomId || !data?.prompt?.trim()) return;
    await this.broadcastChatNarration(c.roomId, data.prompt.trim());
  }

  private normalizeNarrationName(username: string) {
    if (!username) return 'Unknown';
    const trimmed = username.trim();
    const cleaned = trimmed.length > 4 ? trimmed.slice(0, -4).trim() : trimmed;
    return cleaned || trimmed;
  }

  private async getAlivePlayerNames(roomId: string) {
    const players = await this.playersService.getPlayersInRoom(roomId);
    return players
      .filter((player) => player.isAlive)
      .map((player) => this.normalizeNarrationName(player.user.username));
  }

  private buildNarrationFallback(payload: AutomatedNarrationPayload & { playerNames: string[] }) {
    const names = payload.playerNames.length
      ? payload.playerNames.join(', ')
      : 'the remaining players';

    switch (payload.event) {
      case 'game_start':
        return `The table falls silent. ${names} take their seats, and somewhere among them the Mafia is already smiling.`;
      case 'night_phase':
        return `Night covers the town in round ${payload.round ?? 1}. The streets empty, and dangerous choices begin in the dark.`;
      case 'day_phase':
        return payload.context
          ? `Morning breaks. ${payload.context}`
          : `Morning breaks over a nervous town. ${names} must decide who can still be trusted.`;
      case 'voting_phase':
        return payload.context
          ? `The accusations harden into judgment. ${payload.context}`
          : `The discussion is over. The town must vote, and one decision could change everything.`;
      case 'player_eliminated':
        return payload.context
          ? `${payload.context} The circle tightens around ${names}.`
          : `A player has fallen, and the room grows colder. ${names} remain in the game.`;
      case 'game_over':
        return payload.context
          ? `The final truth is out. ${payload.context}`
          : `The game is over, and the town finally learns who outplayed whom.`;
      case 'custom':
      default:
        return payload.context
          ? payload.context
          : `A fresh wave of tension moves through the room as the story takes another turn.`;
    }
  }

  private emitAiNarration(roomId: string, text: string) {
    this.server.to(roomId).emit(EVENTS.AI_NARRATION, {
      text,
      ts: new Date().toISOString(),
    });
  }

  private async requestAutomatedNarration(roomId: string, payload: AutomatedNarrationPayload) {
    const playerNames = payload.playerNames ?? await this.getAlivePlayerNames(roomId);
    const requestBody = { ...payload, roomId, playerNames };
    const fallback = this.buildNarrationFallback({ ...payload, playerNames });

    try {
      const url = this.config.get<string>('AI_SERVICE_URL', 'http://mafia_ai:3003');
      const res = await fetch(`${url}/ai/narrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) throw new Error(`AI service returned ${res.status}`);

      const json = await res.json() as any;
      return json.narration ?? json.reply ?? json.message ?? fallback;
    } catch (err: any) {
      this.logger.warn(`AI narration fallback for ${payload.event}: ${err?.message ?? 'unknown error'}`);
      return fallback;
    }
  }

  async broadcastAutomatedNarration(roomId: string, payload: AutomatedNarrationPayload) {
    const text = await this.requestAutomatedNarration(roomId, payload);
    this.emitAiNarration(roomId, text);
  }

  async broadcastChatNarration(roomId: string, prompt: string) {
    try {
      const url = this.config.get<string>('AI_SERVICE_URL', 'http://mafia_ai:3003');
      const res = await fetch(`${url}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, roomId }),
      });
      if (!res.ok) throw new Error(`AI service returned ${res.status}`);

      const json = await res.json() as any;
      this.emitAiNarration(
        roomId,
        json.narration ?? json.reply ?? json.message ?? 'The narrator weighs every word before speaking.',
      );
    } catch (err: any) {
      this.logger.warn(`Manual AI narration fallback: ${err?.message ?? 'unknown error'}`);
      this.emitAiNarration(roomId, 'The narrator listens, then lets the tension linger for another heartbeat.');
    }
  }

  // ── Broadcast helpers ──────────────────────────────────────────────────────

  broadcastPhaseChange(roomId: string, phase: string, round: number) {
    this.server.to(roomId).emit(EVENTS.PHASE_CHANGED, {
      phase, round, ts: new Date().toISOString(),
    });
  }

  broadcastPlayerEliminated(roomId: string, playerId: string, username: string) {
    this.server.to(roomId).emit(EVENTS.PLAYER_ELIMINATED, { playerId, username });
  }

  broadcastGameOver(
    roomId: string,
    winner: string,
    finalRoles: Array<{ id: string; username: string; role: string; isAlive: boolean }>,
  ) {
    const ts = new Date().toISOString();
    this.server.to(roomId).emit(EVENTS.GAME_OVER, { winner, players: finalRoles, ts });
    this.server.to(roomId).emit(EVENTS.FINAL_ROLES, { players: finalRoles, ts });
  }

  broadcastSystemMessage(roomId: string, text: string) {
    this.server.to(roomId).emit(EVENTS.SYSTEM_MESSAGE, { text, ts: new Date().toISOString() });
  }

  broadcastRunoff(roomId: string, candidateIds: string[], names: string) {
    this.server.to(roomId).emit(EVENTS.RUNOFF_VOTE, {
      candidateIds, names, ts: new Date().toISOString(),
    });
  }

  async sendRolesAndBroadcast(roomId: string, gameState: any) {
    const players = await this.playersService.getPlayersInRoom(roomId);
    this.server.to(roomId).emit(EVENTS.GAME_STARTED, {
      gameState, message: 'Game started! Check your private role.',
    });
    const sockets = await this.server.in(roomId).fetchSockets();
    this.logger.log(`ROLES BROADCAST: ${sockets.length} sockets in room ${roomId}`);
    for (const sock of sockets) {
      const s = sock as unknown as AuthSocket;
      const pd = players.find(p => p.userId === s.userId);
      if (pd) {
        this.logger.log(`  → ${s.username} gets role ${pd.role}`);
        sock.emit('your_role', { role: pd.role, playerId: pd.id });
      }
    }
    void this.broadcastAutomatedNarration(roomId, {
      event: 'game_start',
      context: 'Roles are assigned, the lights dim, and nobody is sure who to trust first.',
      playerNames: players.map((player) => this.normalizeNarrationName(player.user.username)),
    });
  }

  async triggerGameStart(roomId: string, hostId: string) {
    const { gameState } = await this.roomsService.startGameSession(roomId, hostId);
    await this.sendRolesAndBroadcast(roomId, gameState);
    this.readyPlayers.delete(roomId);
  }
}
