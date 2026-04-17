import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GameGateway } from './game.gateway';
import { RoomsModule } from '../modules/rooms/rooms.module';
import { PlayersModule } from '../modules/players/players.module';
import { GameStateModule } from '../modules/game-state/game-state.module';

@Module({
  imports: [
    forwardRef(() => RoomsModule),
    forwardRef(() => PlayersModule),
    forwardRef(() => GameStateModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [GameGateway],
  exports: [GameGateway],
})
export class GatewayModule {}
