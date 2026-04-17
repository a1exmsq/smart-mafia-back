import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GameStateService } from './game-state.service';
import { GameStateController } from './game-state.controller';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GatewayModule } from '../../gateway/gateway.module';
import { PlayersModule } from '../players/players.module';

@Module({
  imports: [
    forwardRef(() => GatewayModule),
    PlayersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [GameStateService, PrismaService, JwtAuthGuard],
  controllers: [GameStateController],
  exports: [GameStateService],
})
export class GameStateModule {}
