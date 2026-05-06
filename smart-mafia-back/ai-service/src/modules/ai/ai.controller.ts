import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { NarrateDto, ChatDto, AiResponseDto } from './dto/ai.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('narrate')
  @ApiOperation({
    summary: 'Generate AI narration for a game event',
    description:
      'Accepts a game event type and optional context, returns dramatic narration text. ' +
      'Called by game-service to broadcast narration to the room.',
  })
  @ApiResponse({ status: 201, type: AiResponseDto })
  @ApiResponse({ status: 503, description: 'OpenAI unavailable' })
  narrate(@Body() dto: NarrateDto): Promise<AiResponseDto> {
    return this.aiService.narrate(dto);
  }

  @Post('chat')
  @ApiOperation({
    summary: 'Chat with the AI narrator',
    description:
      'Players can ask questions or talk to the narrator. Supports conversation history for context.',
  })
  @ApiResponse({ status: 201, type: AiResponseDto })
  chat(@Body() dto: ChatDto): Promise<AiResponseDto> {
    return this.aiService.chat(dto);
  }

  @Get('health')
  @ApiOperation({ summary: 'AI service health — checks OpenAI connectivity' })
  @ApiResponse({ status: 200, description: '{ status: ok|degraded, model }' })
  health() {
    return this.aiService.checkHealth();
  }
}
