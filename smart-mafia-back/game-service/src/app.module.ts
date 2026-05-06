import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './common/prisma.service';
import { PlayersModule } from './modules/players/players.module';
import { GameStateModule } from './modules/game-state/game-state.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PlayersModule,
    GameStateModule,
    RoomsModule,
    GatewayModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
