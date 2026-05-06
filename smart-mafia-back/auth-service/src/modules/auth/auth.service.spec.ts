import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

const mockUser = {
  id: 'uuid-123',
  username: 'test_player',
  email: 'test@mafia.com',
  role: 'PLAYER',
  password: 'hashed',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUsersService = {
  create: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
  validatePassword: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test_secret'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should return tokens on successful registration', async () => {
      mockUsersService.create.mockResolvedValue(mockUser);

      const result = await service.register({
        username: 'test_player',
        email: 'test@mafia.com',
        password: 'SecurePass1!',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.userId).toBe(mockUser.id);
      expect(result.username).toBe(mockUser.username);
    });

    it('should propagate ConflictException from UsersService', async () => {
      mockUsersService.create.mockRejectedValue(new ConflictException());
      await expect(
        service.register({ username: 'dup', email: 'dup@x.com', password: 'Pass1!' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return tokens when credentials are valid', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(true);

      const result = await service.login({ email: 'test@mafia.com', password: 'SecurePass1!' });

      expect(result.accessToken).toBeDefined();
      expect(result.userId).toBe(mockUser.id);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@x.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(false);
      await expect(
        service.login({ email: 'test@mafia.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
