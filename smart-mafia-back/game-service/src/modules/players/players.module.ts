import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PlayersService } from './players.service';
import { PlayersController } from './players.controller';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [PlayersService, PrismaService, JwtAuthGuard],
  controllers: [PlayersController],
  exports: [PlayersService],
})
export class PlayersModule {}
