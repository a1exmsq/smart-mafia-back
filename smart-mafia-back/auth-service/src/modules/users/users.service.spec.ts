import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../common/prisma.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));

const mockUser = {
  id: 'user-uuid',
  username: 'test_player',
  email: 'test@mafia.com',
  password: 'hashed_password',
  role: 'PLAYER',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('should create a user and return profile without password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await service.create({
        username: 'test_player',
        email: 'test@mafia.com',
        password: 'SecurePass1!',
      });

      expect(result).not.toHaveProperty('password');
      expect(result.username).toBe('test_player');
      expect(bcrypt.hash).toHaveBeenCalledWith('SecurePass1!', 12);
    });

    it('should throw ConflictException when email or username taken', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      await expect(
        service.create({ username: 'test_player', email: 'test@mafia.com', password: 'Pass1!' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findById()', () => {
    it('should return user without password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      const result = await service.findById('user-uuid');
      expect(result).not.toHaveProperty('password');
      expect(result.id).toBe('user-uuid');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findById('nobody')).rejects.toThrow(NotFoundException);
    });
  });

  describe('validatePassword()', () => {
    it('should return true for correct password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const result = await service.validatePassword('plain', 'hashed');
      expect(result).toBe(true);
    });

    it('should return false for wrong password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const result = await service.validatePassword('wrong', 'hashed');
      expect(result).toBe(false);
    });
  });
});
