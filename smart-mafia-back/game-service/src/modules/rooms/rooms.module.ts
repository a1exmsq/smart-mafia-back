import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlayersModule } from '../players/players.module';
import { GameStateModule } from '../game-state/game-state.module';
import { GatewayModule } from '../../gateway/gateway.module';

@Module({
  imports: [
    PlayersModule,
    forwardRef(() => GameStateModule),
    forwardRef(() => GatewayModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [RoomsService, PrismaService, JwtAuthGuard],
  controllers: [RoomsController],
  exports: [RoomsService],
})
export class RoomsModule {}
