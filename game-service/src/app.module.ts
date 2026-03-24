import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './common/prisma.service';
import { RoomsModule } from './modules/rooms/rooms.module';
import { PlayersModule } from './modules/players/players.module';
import { GameStateModule } from './modules/game-state/game-state.module';
import { GameGateway } from './gateway/game.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
    RoomsModule,
    PlayersModule,
    GameStateModule,
  ],
  providers: [PrismaService, GameGateway],
})
export class AppModule {}
