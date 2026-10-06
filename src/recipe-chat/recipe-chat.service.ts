import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecommendRecipeDto } from './dto/recommend-recipe.dto';

@Injectable()
export class RecipeChatService {
  private readonly logger = new Logger(RecipeChatService.name);
  private readonly MODEL = 'gemini-3.6-flash';
  private readonly API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL}:generateContent`;

  constructor(private configService: ConfigService) { }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async recommendRecipe(dto: RecommendRecipeDto) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new HttpException('GEMINI_API_KEY가 설정되지 않았습니다.', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const lang = dto.lang === 'japanese' ? '일본어' : '한국어';

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `당신은 AI 요리 도우미입니다. 식재료와 요청을 바탕으로 레시피 1~2개를 추천하세요.
응답 언어: ${lang}
식재료: ${dto.ingredients.join(', ')}
요청: ${dto.message}

다음 JSON 스키마를 반드시 따르세요:
{
  "replyText": "string",
  "recipes": [
    {
      "title": "string",
      "time": "string",
      "difficulty": "초급 또는 중급 또는 상급",
      "matchRate": "string (예: 95%)",
      "ingredients": ["string"],
      "instructions": ["string"]
    }
  ]
}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
      },
    };

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 3000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        this.logger.log(`Gemini API 호출 시도 ${attempt}/${MAX_RETRIES} | key: ${apiKey.substring(0, 10)}...${apiKey.slice(-4)} | url: ${this.API_URL}`);

        const res = await fetch(`${this.API_URL}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        // 503은 일시적 과부하 → 재시도
        if (res.status === 503 && attempt < MAX_RETRIES) {
          this.logger.warn(`503 과부하. ${RETRY_DELAY_MS / 1000}초 후 재시도... (${attempt}/${MAX_RETRIES})`);
          await this.sleep(RETRY_DELAY_MS);
          continue;
        }

        if (!res.ok) {
          const errBody = await res.text();
          this.logger.error(`Gemini API HTTP ${res.status}: ${errBody}`);
          throw new Error(`Gemini 응답 오류 (${res.status}): ${errBody}`);
        }

        const data: any = await res.json();
        const responseText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        const cleanJson = responseText
          .replace(/^```json\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        return JSON.parse(cleanJson);
      } catch (error: any) {
        if (attempt === MAX_RETRIES) {
          this.logger.error('Gemini API 최종 실패', error?.message);
          throw new HttpException(
            `AI 레시피 추천 실패: ${error.message}`,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        this.logger.warn(`오류 발생, 재시도 중... (${attempt}/${MAX_RETRIES}): ${error?.message}`);
        await this.sleep(RETRY_DELAY_MS);
      }
    }
  }
}
