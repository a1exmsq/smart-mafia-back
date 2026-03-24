import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { NarrationEvent } from './dto/ai.dto';

const mockConfigService = {
  get: jest.fn((key: string, fallback?: any) => {
    const values: Record<string, string> = {
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'gpt-4o-mini',
      NARRATOR_PERSONA: 'You are a test narrator.',
    };
    return values[key] ?? fallback;
  }),
};

// Mock the OpenAI SDK
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Dramatic narration text.' } }],
          model: 'gpt-4o-mini',
          usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
        }),
      },
    },
    models: {
      retrieve: jest.fn().mockResolvedValue({ id: 'gpt-4o-mini' }),
    },
  }));
});

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  describe('narrate()', () => {
    it('should return narration for GAME_START event', async () => {
      const result = await service.narrate({
        event: NarrationEvent.GAME_START,
        playerNames: ['Alice', 'Bob', 'Charlie'],
        round: 1,
      });

      expect(result).toHaveProperty('narration');
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('usage');
      expect(typeof result.narration).toBe('string');
      expect(result.narration.length).toBeGreaterThan(0);
    });

    it('should return narration for NIGHT_PHASE event', async () => {
      const result = await service.narrate({
        event: NarrationEvent.NIGHT_PHASE,
        round: 2,
        context: 'Two players remain suspicious.',
      });

      expect(result.narration).toBeDefined();
      expect(result.usage.totalTokens).toBe(80);
    });

    it('should handle all NarrationEvent types without throwing', async () => {
      for (const event of Object.values(NarrationEvent)) {
        await expect(service.narrate({ event })).resolves.toBeDefined();
      }
    });
  });

  describe('chat()', () => {
    it('should return a response for a player message', async () => {
      const result = await service.chat({
        message: 'Who do you think is the mafia?',
        roomId: 'room-123',
      });

      expect(result.narration).toBe('Dramatic narration text.');
    });

    it('should include conversation history in context', async () => {
      const result = await service.chat({
        message: 'What happened last night?',
        history: [
          { role: 'user', content: 'Hello narrator' },
          { role: 'assistant', content: 'Greetings, brave soul...' },
        ],
      });

      expect(result).toHaveProperty('narration');
    });
  });

  describe('checkHealth()', () => {
    it('should return ok status when OpenAI is reachable', async () => {
      const result = await service.checkHealth();
      expect(result.status).toBe('ok');
      expect(result.model).toBe('gpt-4o-mini');
    });
  });
});
