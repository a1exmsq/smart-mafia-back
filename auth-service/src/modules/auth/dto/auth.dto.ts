import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'player@mafia.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass1!' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT access token (15 min)' })
  accessToken: string;

  @ApiProperty({ description: 'JWT refresh token (7 days)' })
  refreshToken: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  username: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Valid refresh token' })
  @IsString()
  refreshToken: string;
}
