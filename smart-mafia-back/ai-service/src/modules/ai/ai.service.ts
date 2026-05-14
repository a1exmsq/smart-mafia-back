import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { NarrateDto, NarrationEvent, AiResponseDto, ChatDto } from './dto/ai.dto';

// ── Prompt templates per game event ──────────────────────────────────────────
const NARRATION_PROMPTS: Record<NarrationEvent, (ctx: NarrateDto) => string> = {
  [NarrationEvent.GAME_START]: (ctx) => {
    const settings = [
      'a late-night poker game in the back room of a dimly lit bar',
      'a weekend retreat at a remote mountain cabin with no phone signal',
      'a corporate team-building trip that took a very dark turn',
      'an underground speakeasy during a thunderstorm',
      'a masquerade ball in an old mansion where the power has just gone out',
      'a night shift at a research station cut off from the outside world',
      'a reunion dinner in a locked restaurant after the last train left',
    ];
    const setting = settings[Math.floor(Math.random() * settings.length)];
    const names = ctx.playerNames?.join(', ') ?? 'the players';
    return `Set the scene: ${names} find themselves at ${setting}. ` +
      `Someone among them is Mafia — they know who each other are, but nobody else does. ` +
      `Write a short, atmospheric opening (max 100 words) that establishes this setting and builds dread. ` +
      `Do not reveal roles. End with a line that signals the game has begun.`;
  },

  [NarrationEvent.DAY_PHASE]: (ctx) =>
    `It is morning — Round ${ctx.round ?? 1}. ` +
    (ctx.context ? `Last night: ${ctx.context} ` : 'The night passed quietly. ') +
    `Surviving players: ${ctx.playerNames?.join(', ') ?? 'the group'}. ` +
    `Narrate the dawn dramatically in under 80 words — describe what the survivors discover, ` +
    `the atmosphere of suspicion, and remind them to find the Mafia before night returns.`,

  [NarrationEvent.VOTING_PHASE]: (ctx) =>
    `The town must now vote to eliminate a suspect. Round ${ctx.round ?? 1}.
     ${ctx.context ?? ''} 
     Players present: ${ctx.playerNames?.join(', ') ?? 'unknown'}.
     Narrate this tense voting moment dramatically. Remind them a wrong choice could doom the town.`,

  [NarrationEvent.NIGHT_PHASE]: (ctx) =>
    `Night falls over the town. Round ${ctx.round ?? 1}. Everyone closes their eyes.
     ${ctx.context ?? 'Darkness descends and evil stirs.'}
     The Mafia is awake and choosing their next victim.
     Narrate the eerie silence of the night dramatically.`,

  [NarrationEvent.PLAYER_ELIMINATED]: (ctx) =>
    `A player has been eliminated! ${ctx.context ?? 'The town has made its choice.'}
     Narrate this elimination dramatically. Their fate has been sealed.
     The remaining players: ${ctx.playerNames?.join(', ') ?? 'unknown'}.`,

  [NarrationEvent.GAME_OVER]: (ctx) =>
    `The game is over! ${ctx.context ?? 'Victory has been decided.'}
     ${ctx.playerNames?.length ? `Survivors: ${ctx.playerNames.join(', ')}.` : ''}
     Deliver a dramatic closing narration fitting for the winners.`,

  [NarrationEvent.CUSTOM]: (ctx) =>
    ctx.context ?? 'Narrate an interesting moment in the Mafia game.',
};

@Injectable()
export class AiService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(AiService.name);
  private readonly model: string;
  private readonly systemPrompt: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('⚠️  OPENAI_API_KEY not set — AI responses will be mocked');
    }

    const baseURL = this.config.get<string>('OPENAI_BASE_URL', 'https://api.groq.com/openai/v1');
    this.openai = new OpenAI({ apiKey: apiKey || 'not-set', baseURL });
    this.model = this.config.get<string>('OPENAI_MODEL', 'llama3-8b-8192');
    this.systemPrompt = this.config.get<string>(
      'NARRATOR_PERSONA',
      'You are a dramatic narrator for the Mafia party game. Keep responses under 120 words. Use atmospheric, suspenseful language.',
    );
  }

  // ── Narration: game events ─────────────────────────────────────────────────
  async narrate(dto: NarrateDto): Promise<AiResponseDto> {
    const userPrompt = NARRATION_PROMPTS[dto.event](dto);
    return this.callOpenAI(
      [{ role: 'user', content: userPrompt }],
      this.buildFallbackNarration(dto),
    );
  }

  // ── Chat: player talks to AI narrator ─────────────────────────────────────
  async chat(dto: ChatDto): Promise<AiResponseDto> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...(dto.history ?? []).map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: dto.message },
    ];

    return this.callOpenAI(
      messages,
      'The narrator leans closer to the table, letting the suspense breathe for a moment.',
    );
  }

  // ── Health: verify OpenAI reachability ────────────────────────────────────
  async checkHealth(): Promise<{ status: string; model: string }> {
    try {
      await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      });
      return { status: 'ok', model: this.model };
    } catch {
      return { status: 'degraded', model: this.model };
    }
  }

  // ── Core OpenAI call with error handling ──────────────────────────────────
  private async callOpenAI(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    fallbackNarration: string,
  ): Promise<AiResponseDto> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'system', content: this.systemPrompt }, ...messages],
        max_tokens: 200,
        temperature: 0.85,
      });

      const choice = response.choices[0];
      const narration = choice.message?.content ?? 'The narrator is silent...';

      this.logger.debug(`AI narration generated (${response.usage?.total_tokens} tokens)`);

      return {
        narration,
        model: response.model,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
      };
    } catch (err: any) {
      this.logger.error('OpenAI call failed', err?.message);

      return {
        narration: fallbackNarration,
        model: this.model,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }
  }

  private buildFallbackNarration(dto: NarrateDto) {
    const names = dto.playerNames?.length
      ? dto.playerNames.join(', ')
      : 'the remaining players';

    switch (dto.event) {
      case NarrationEvent.GAME_START:
        return `The game begins. ${names} take their seats, and somewhere among them the Mafia is already hiding in plain sight.`;
      case NarrationEvent.NIGHT_PHASE:
        return `Night falls over Smart Mafia. Round ${dto.round ?? 1} begins, and the shadows start choosing their next move.`;
      case NarrationEvent.DAY_PHASE:
        return dto.context
          ? `Dawn arrives. ${dto.context}`
          : `Dawn arrives, and ${names} must decide who can still be trusted.`;
      case NarrationEvent.VOTING_PHASE:
        return dto.context
          ? `The room turns tense. ${dto.context}`
          : `The talking stops here. The town must vote, and one choice may decide everything.`;
      case NarrationEvent.PLAYER_ELIMINATED:
        return dto.context
          ? `${dto.context} The game narrows and every face is harder to read.`
          : `A player is gone, and the room feels smaller already.`;
      case NarrationEvent.GAME_OVER:
        return dto.context
          ? `The final reveal is here. ${dto.context}`
          : `The game is over, and the truth can finally step into the light.`;
      case NarrationEvent.CUSTOM:
      default:
        return dto.context
          ? dto.context
          : 'The story takes another turn, and nobody at the table can relax yet.';
    }
  }
}
