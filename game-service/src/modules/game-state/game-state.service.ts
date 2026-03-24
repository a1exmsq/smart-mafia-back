import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { GamePhase, GameState, MafiaRole, RoomStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface GameSnapshot {
  phase: string;
  round: number;
  alivePlayers: { id: string; username: string; role?: string }[];
  eliminatedThisRound?: string[];
  votes?: Record<string, string>;
  winner?: 'MAFIA' | 'CIVILIANS' | null;
}

function toSnapshot(val: Prisma.JsonValue): GameSnapshot {
  return val as unknown as GameSnapshot;
}

function toJsonValue(snap: GameSnapshot): Prisma.InputJsonValue {
  return snap as unknown as Prisma.InputJsonValue;
}

@Injectable()
export class GameStateService {
  constructor(private readonly prisma: PrismaService) {}

  async initGame(roomId: string): Promise<GameState> {
    const players = await this.prisma.player.findMany({
      where: { roomId, isAlive: true },
      include: { user: { select: { username: true } } },
    });

    const snapshot: GameSnapshot = {
      phase: GamePhase.DAY,
      round: 1,
      alivePlayers: players.map((p) => ({ id: p.id, username: p.user.username })),
      votes: {},
      winner: null,
    };

    return this.prisma.gameState.create({
      data: { roomId, phase: GamePhase.DAY, round: 1, snapshot: toJsonValue(snapshot) },
    });
  }

  async getCurrentState(roomId: string): Promise<GameState> {
    const state = await this.prisma.gameState.findFirst({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
    });
    if (!state) throw new NotFoundException(`No game state for room ${roomId}`);
    return state;
  }

  async advancePhase(roomId: string): Promise<GameState> {
    const current = await this.getCurrentState(roomId);
    const snapshot = toSnapshot(current.snapshot);

    const nextPhase = this.getNextPhase(current.phase);
    const nextRound = nextPhase === GamePhase.DAY ? current.round + 1 : current.round;

    const alivePlayers = await this.prisma.player.findMany({
      where: { roomId, isAlive: true },
      include: { user: { select: { username: true } } },
    });

    const winner = await this.checkWinCondition(roomId);

    const newSnapshot: GameSnapshot = {
      ...snapshot,
      phase: nextPhase,
      round: nextRound,
      alivePlayers: alivePlayers.map((p) => ({ id: p.id, username: p.user.username })),
      votes: {},
      eliminatedThisRound: [],
      winner,
    };

    if (winner) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.FINISHED },
      });
    }

    return this.prisma.gameState.create({
      data: { roomId, phase: nextPhase, round: nextRound, snapshot: toJsonValue(newSnapshot) },
    });
  }

  async recordVote(roomId: string, voterId: string, targetId: string): Promise<GameState> {
    const current = await this.getCurrentState(roomId);
    const snapshot = toSnapshot(current.snapshot);

    const updatedVotes = { ...snapshot.votes, [voterId]: targetId };
    const updatedSnapshot: GameSnapshot = { ...snapshot, votes: updatedVotes };

    return this.prisma.gameState.update({
      where: { id: current.id },
      data: { snapshot: toJsonValue(updatedSnapshot) },
    });
  }

  async resolveVotes(roomId: string): Promise<{ eliminated: string | null; state: GameState }> {
    const current = await this.getCurrentState(roomId);
    const snapshot = toSnapshot(current.snapshot);
    const votes = snapshot.votes ?? {};

    const tally: Record<string, number> = {};
    for (const targetId of Object.values(votes)) {
      tally[targetId] = (tally[targetId] ?? 0) + 1;
    }

    let eliminated: string | null = null;
    if (Object.keys(tally).length > 0) {
      eliminated = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
      await this.prisma.player.update({
        where: { id: eliminated },
        data: { isAlive: false },
      });
    }

    const updatedState = await this.advancePhase(roomId);
    return { eliminated, state: updatedState };
  }

  private async checkWinCondition(roomId: string): Promise<'MAFIA' | 'CIVILIANS' | null> {
    const alivePlayers = await this.prisma.player.findMany({
      where: { roomId, isAlive: true },
    });

    const mafiaCount = alivePlayers.filter((p) => p.role === MafiaRole.MAFIA).length;
    const civilianCount = alivePlayers.filter((p) => p.role !== MafiaRole.MAFIA).length;

    if (mafiaCount === 0) return 'CIVILIANS';
    if (mafiaCount >= civilianCount) return 'MAFIA';
    return null;
  }

  private getNextPhase(current: GamePhase): GamePhase {
    const cycle: GamePhase[] = [GamePhase.DAY, GamePhase.VOTING, GamePhase.NIGHT];
    const idx = cycle.indexOf(current);
    return cycle[(idx + 1) % cycle.length];
  }
}
