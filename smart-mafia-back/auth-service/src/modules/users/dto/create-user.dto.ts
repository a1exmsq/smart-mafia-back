import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'player_one', description: '3-50 chars, letters/numbers/underscores' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username: only letters, numbers and underscores allowed',
  })
  username: string;

  @ApiProperty({ example: 'player@mafia.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass1!', description: 'Min 8 chars, 1 uppercase, 1 number' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must contain at least one uppercase letter and one number',
  })
  password: string;
}
