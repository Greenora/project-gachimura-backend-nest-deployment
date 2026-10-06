import { Controller, Post, Body } from '@nestjs/common';
import { RecipeChatService } from './recipe-chat.service';
import { RecommendRecipeDto } from './dto/recommend-recipe.dto';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';

@ApiTags('recipe-chat')
@Controller('recipe-chat')
export class RecipeChatController {
  constructor(private readonly recipeChatService: RecipeChatService) {}

  @Post('recommend')
  @ApiOperation({
    summary: 'AI 레시피 추천',
    description: '보유한 식재료 목록과 요청을 바탕으로 Gemini AI가 레시피 1~2개를 추천합니다.',
  })
  @ApiBody({
    type: RecommendRecipeDto,
    examples: {
      korean: {
        summary: '한국어 예시',
        value: {
          ingredients: ['토마토', '계란', '대파'],
          message: '냉장고에 있는 재료로 간단하게 만들 수 있는 요리 추천해줘',
          lang: 'korean',
        },
      },
      japanese: {
        summary: '일본어 예시',
        value: {
          ingredients: ['豆腐', '味噌', '長ネギ'],
          message: '簡単な料理を教えてください',
          lang: 'japanese',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'AI 레시피 추천 성공',
    schema: {
      example: {
        replyText: '토마토와 계란으로 빠르게 만들 수 있는 요리를 추천해 드립니다!',
        recipes: [
          {
            title: '토마토 달걀 볶음',
            time: '10분',
            difficulty: '초급',
            matchRate: '100%',
            ingredients: ['토마토 2개', '계란 3개', '대파 1/2대', '굴소스 1큰술'],
            instructions: ['토마토를 깍둑썰기 합니다.', '계란을 풀어 스크램블 에그를 만듭니다.', '토마토와 함께 볶아 완성합니다.'],
          },
        ],
      },
    },
  })
  async recommend(@Body() dto: RecommendRecipeDto) {
    return this.recipeChatService.recommendRecipe(dto);
  }
}
