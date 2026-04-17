import {
  Injectable, BadRequestException, NotFoundException,
  forwardRef, Inject,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { GamePhase, GameState, MafiaRole, RoomStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { GameGateway } from '../../gateway/game.gateway';

export interface NightActions {
  mafiaVotes?: Record<string, string>;
  doctorSave?: string;
  detectiveCheck?: string;
}

export interface GameSnapshot {
  phase: string;
  round: number;
  alivePlayers: { id: string; username: string }[];
  votes?: Record<string, string>;
  nightActions?: NightActions;
  winner?: 'MAFIA' | 'CIVILIANS' | null;
  doctorLastSaved?: string | null;
  doctorSelfHealUsed?: boolean;
  lastNightResult?: {
    killedName: string | null;
    savedByDoctor: boolean;
  } | null;
  // Runoff voting state
  runoffCandidates?: string[] | null;  // player ids in runoff
  isRunoff?: boolean;
  // Final role reveal — populated when phase becomes GAME_OVER
  finalRoles?: Array<{ id: string; username: string; role: string; isAlive: boolean }> | null;
}

function toSnapshot(val: Prisma.JsonValue): GameSnapshot {
  return val as unknown as GameSnapshot;
}
function toJsonValue(snap: GameSnapshot): Prisma.InputJsonValue {
  return snap as unknown as Prisma.InputJsonValue;
}

@Injectable()
export class GameStateService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => GameGateway))
    private readonly gateway: GameGateway,
  ) {}

  async findCurrentState(roomId: string): Promise<GameState | null> {
    return this.prisma.gameState.findFirst({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCurrentState(roomId: string): Promise<GameState> {
    const state = await this.findCurrentState(roomId);
    if (!state) throw new NotFoundException(`No game state for room ${roomId}`);
    return state;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async initGame(roomId: string): Promise<GameState> {
    const existing = await this.findCurrentState(roomId);
    if (existing) return existing;

    const players = await this.prisma.player.findMany({
      where: { roomId, isAlive: true },
      include: { user: { select: { username: true } } },
    });

    const snapshot: GameSnapshot = {
      phase: GamePhase.INTRO,
      round: 1,
      alivePlayers: players.map(p => ({ id: p.id, username: p.user.username })),
      votes: {},
      nightActions: {},
      winner: null,
      doctorLastSaved: null,
      doctorSelfHealUsed: false,
      lastNightResult: null,
      runoffCandidates: null,
      isRunoff: false,
    };

    return this.prisma.gameState.create({
      data: { roomId, phase: GamePhase.INTRO, round: 1, snapshot: toJsonValue(snapshot) },
    });
  }

  // ── Advance phase ─────────────────────────────────────────────────────────

  async advancePhase(roomId: string): Promise<GameState> {
    const current = await this.getCurrentState(roomId);
    if (current.phase === GamePhase.GAME_OVER) return current;

    const snapshot = toSnapshot(current.snapshot);
    let nightResult: GameSnapshot['lastNightResult'] = null;

    if (current.phase === GamePhase.NIGHT) {
      nightResult = await this.processNightActions(roomId, snapshot);
    }

    const winner = await this.checkWinCondition(roomId);
    const nextPhase = winner ? GamePhase.GAME_OVER : this.getNextPhase(current.phase);
    const nextRound = nextPhase === GamePhase.NIGHT ? current.round + 1 : current.round;

    const alivePlayers = await this.prisma.player.findMany({
      where: { roomId, isAlive: true },
      include: { user: { select: { username: true } } },
    });

    // Collect final roles when game ends so every client can see the reveal
    let finalRoles: GameSnapshot['finalRoles'] = null;
    if (winner) {
      const allPlayers = await this.prisma.player.findMany({
        where: { roomId },
        include: { user: { select: { username: true } } },
      });
      finalRoles = allPlayers.map(p => ({
        id: p.id,
        username: p.user.username,
        role: p.role as string,
        isAlive: p.isAlive,
      }));
    }

    const newSnapshot: GameSnapshot = {
      phase: nextPhase,
      round: nextRound,
      alivePlayers: alivePlayers.map(p => ({ id: p.id, username: p.user.username })),
      votes: {},
      nightActions: {},
      winner,
      doctorLastSaved: nightResult
        ? (snapshot.nightActions?.doctorSave ?? null)
        : snapshot.doctorLastSaved,
      doctorSelfHealUsed: snapshot.doctorSelfHealUsed ?? false,
      lastNightResult: nightResult,
      runoffCandidates: null,
      isRunoff: false,
      finalRoles,
    };

    if (winner) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.FINISHED },
      });
    }

    const newState = await this.prisma.gameState.create({
      data: { roomId, phase: nextPhase, round: nextRound, snapshot: toJsonValue(newSnapshot) },
    });

    if (winner) {
      this.gateway.broadcastGameOver(roomId, winner, finalRoles!);
    } else {
      if (nextPhase === GamePhase.DAY && current.phase === GamePhase.NIGHT && nightResult) {
        if (!nightResult.killedName) {
          const msg = nightResult.savedByDoctor
            ? `☀️ Morning arrives. Someone was attacked, but the Doctor saved them!`
            : `☀️ Morning arrives. The night passed quietly — nobody was killed.`;
          this.gateway.broadcastSystemMessage(roomId, msg);
        } else {
          this.gateway.broadcastSystemMessage(roomId,
            `☀️ Morning arrives. ${nightResult.killedName} was found dead.`);
        }
      }
      this.gateway.broadcastPhaseChange(roomId, nextPhase, nextRound);
    }

    return newState;
  }

  // ── Process night ─────────────────────────────────────────────────────────

  private async processNightActions(
    roomId: string,
    snapshot: GameSnapshot,
  ): Promise<GameSnapshot['lastNightResult']> {
    const mafiaVotes = snapshot.nightActions?.mafiaVotes ?? {};
    const doctorSave = snapshot.nightActions?.doctorSave ?? null;

    const tally: Record<string, number> = {};
    for (const t of Object.values(mafiaVotes)) {
      tally[t] = (tally[t] ?? 0) + 1;
    }

    if (Object.keys(tally).length === 0) {
      return { killedName: null, savedByDoctor: false };
    }

    const maxVotes = Math.max(...Object.values(tally));
    const topTargets = Object.entries(tally)
      .filter(([, v]) => v === maxVotes).map(([id]) => id);

    // Mafia tie → random among top
    const eliminatedId = topTargets[Math.floor(Math.random() * topTargets.length)];

    if (doctorSave && doctorSave === eliminatedId) {
      return { killedName: null, savedByDoctor: true };
    }

    const player = await this.prisma.player.update({
      where: { id: eliminatedId },
      data: { isAlive: false },
      include: { user: { select: { username: true } } },
    });

    this.gateway.broadcastPlayerEliminated(roomId, eliminatedId, player.user.username);
    return { killedName: player.user.username, savedByDoctor: false };
  }

  // ── Day voting ────────────────────────────────────────────────────────────

  async recordVote(roomId: string, voterId: string, targetId: string): Promise<GameState> {
    const current = await this.getCurrentState(roomId);
    if (current.phase !== GamePhase.VOTING) {
      throw new BadRequestException('Voting is only allowed during the VOTING phase');
    }

    const snapshot = toSnapshot(current.snapshot);

    // In runoff — only votes for runoff candidates are allowed
    if (snapshot.isRunoff && snapshot.runoffCandidates) {
      if (!snapshot.runoffCandidates.includes(targetId)) {
        throw new BadRequestException('During runoff you can only vote for the tied candidates');
      }
    }

    const [voter, target] = await Promise.all([
      this.prisma.player.findFirst({ where: { id: voterId, roomId, isAlive: true } }),
      this.prisma.player.findFirst({ where: { id: targetId, roomId, isAlive: true } }),
    ]);

    if (!voter) throw new NotFoundException('Voter not found or eliminated');
    if (!target) throw new NotFoundException('Target not found or eliminated');
    if (voter.id === target.id) throw new BadRequestException('Cannot vote for yourself');

    return this.prisma.gameState.update({
      where: { id: current.id },
      data: { snapshot: toJsonValue({ ...snapshot, votes: { ...snapshot.votes, [voterId]: targetId } }) },
    });
  }

  async resolveVotes(roomId: string): Promise<{ eliminated: string | null; state: GameState }> {
    const current = await this.getCurrentState(roomId);
    if (current.phase !== GamePhase.VOTING) {
      throw new BadRequestException('Votes can only be resolved during VOTING phase');
    }

    const snapshot = toSnapshot(current.snapshot);
    const votes = snapshot.votes ?? {};

    const tally: Record<string, number> = {};
    for (const targetId of Object.values(votes)) {
      tally[targetId] = (tally[targetId] ?? 0) + 1;
    }

    // No votes at all
    if (Object.keys(tally).length === 0) {
      this.gateway.broadcastSystemMessage(roomId, `⚖️ No votes were cast. Nobody is eliminated.`);
      const newState = await this.advancePhase(roomId);
      return { eliminated: null, state: newState };
    }

    const maxVotes = Math.max(...Object.values(tally));
    const topTargets = Object.entries(tally)
      .filter(([, v]) => v === maxVotes).map(([id]) => id);

    // Clear winner
    if (topTargets.length === 1) {
      const eliminated = topTargets[0];
      const player = await this.prisma.player.update({
        where: { id: eliminated },
        data: { isAlive: false },
        include: { user: { select: { username: true } } },
      });
      this.gateway.broadcastPlayerEliminated(roomId, eliminated, player.user.username);
      const newState = await this.advancePhase(roomId);
      return { eliminated, state: newState };
    }

    // Tie — was this already a runoff?
    if (snapshot.isRunoff) {
      // Second tie → random elimination (lot drawing)
      const eliminated = topTargets[Math.floor(Math.random() * topTargets.length)];

      // Get names for announcement
      const tied = await this.prisma.player.findMany({
        where: { id: { in: topTargets } },
        include: { user: { select: { username: true } } },
      });
      const tiedNames = tied.map(p => p.user.username).join(' and ');

      this.gateway.broadcastSystemMessage(roomId,
        `⚖️ Another tie between ${tiedNames}! Drawing lots...`);

      const player = await this.prisma.player.update({
        where: { id: eliminated },
        data: { isAlive: false },
        include: { user: { select: { username: true } } },
      });

      this.gateway.broadcastSystemMessage(roomId,
        `🎲 Fate decided — ${player.user.username} is eliminated!`);
      this.gateway.broadcastPlayerEliminated(roomId, eliminated, player.user.username);

      const newState = await this.advancePhase(roomId);
      return { eliminated, state: newState };
    }

    // First tie → start runoff vote between tied candidates
    const tied = await this.prisma.player.findMany({
      where: { id: { in: topTargets } },
      include: { user: { select: { username: true } } },
    });
    const tiedNames = tied.map(p => p.user.username).join(', ');

    this.gateway.broadcastSystemMessage(roomId,
      `⚖️ Tie between ${tiedNames}! Starting runoff vote — vote again for one of them.`);

    // Reset votes, set runoff state (stay in VOTING phase)
    const runoffSnapshot: GameSnapshot = {
      ...snapshot,
      votes: {},
      runoffCandidates: topTargets,
      isRunoff: true,
    };

    const updatedState = await this.prisma.gameState.update({
      where: { id: current.id },
      data: { snapshot: toJsonValue(runoffSnapshot) },
    });

    // Broadcast VOTING phase again with runoff flag
    this.gateway.broadcastRunoff(roomId, topTargets, tiedNames);

    return { eliminated: null, state: updatedState };
  }

  // ── Night actions ─────────────────────────────────────────────────────────

  async recordNightAction(
    roomId: string,
    actorId: string,
    action: 'mafia_kill' | 'doctor_save' | 'detective_check',
    targetId: string,
  ): Promise<{ result?: string }> {
    const current = await this.getCurrentState(roomId);
    if (current.phase !== GamePhase.NIGHT) {
      throw new BadRequestException('Night actions only allowed during NIGHT phase');
    }

    const actor = await this.prisma.player.findFirst({
      where: { id: actorId, roomId, isAlive: true },
    });
    if (!actor) throw new NotFoundException('Actor not found');

    const target = await this.prisma.player.findFirst({
      where: { id: targetId, roomId, isAlive: true },
    });
    if (!target) throw new NotFoundException('Target not found');

    const snapshot = toSnapshot(current.snapshot);
    const nightActions = { ...(snapshot.nightActions ?? {}) };
    let detectiveResult: string | undefined;

    if (action === 'mafia_kill') {
      if (actor.role !== MafiaRole.MAFIA) throw new BadRequestException('Only Mafia can kill');
      nightActions.mafiaVotes = { ...(nightActions.mafiaVotes ?? {}), [actorId]: targetId };

    } else if (action === 'doctor_save') {
      if (actor.role !== MafiaRole.DOCTOR) throw new BadRequestException('Only Doctor can save');
      if (snapshot.doctorLastSaved && snapshot.doctorLastSaved === targetId) {
        throw new BadRequestException('Cannot save the same player two nights in a row');
      }
      if (targetId === actorId && snapshot.doctorSelfHealUsed) {
        throw new BadRequestException('You can only use self-heal once per game');
      }
      nightActions.doctorSave = targetId;

    } else if (action === 'detective_check') {
      if (actor.role !== MafiaRole.DETECTIVE) throw new BadRequestException('Only Detective can check');
      nightActions.detectiveCheck = targetId;
      detectiveResult = target.role === MafiaRole.MAFIA ? 'MAFIA' : 'NOT MAFIA';
    }

    const isSelfHeal = action === 'doctor_save' && targetId === actorId;
    await this.prisma.gameState.update({
      where: { id: current.id },
      data: {
        snapshot: toJsonValue({
          ...snapshot,
          nightActions,
          ...(isSelfHeal ? { doctorSelfHealUsed: true } : {}),
        }),
      },
    });

    return { result: detectiveResult };
  }

  // ── Win condition ─────────────────────────────────────────────────────────

  private async checkWinCondition(roomId: string): Promise<'MAFIA' | 'CIVILIANS' | null> {
    const alive = await this.prisma.player.findMany({ where: { roomId, isAlive: true } });
    const mafiaCount = alive.filter(p => p.role === MafiaRole.MAFIA).length;
    const civilianCount = alive.filter(p => p.role !== MafiaRole.MAFIA).length;
    if (mafiaCount === 0) return 'CIVILIANS';
    if (mafiaCount >= civilianCount) return 'MAFIA';
    return null;
  }

  private getNextPhase(current: GamePhase): GamePhase {
    if (current === GamePhase.GAME_OVER) return GamePhase.GAME_OVER;
    if (current === GamePhase.INTRO) return GamePhase.NIGHT;
    if (current === GamePhase.NIGHT) return GamePhase.DAY;
    if (current === GamePhase.DAY) return GamePhase.VOTING;
    if (current === GamePhase.VOTING) return GamePhase.NIGHT;
    return GamePhase.DAY;
  }
}
