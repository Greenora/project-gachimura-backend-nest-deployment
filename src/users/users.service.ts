import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { NICKNAME_DATA } from './nickname.constants';

// 카카오 로그인 응답 타입
export interface KakaoLoginResponse {
  message: string;
  user: User;
}

// 카카오 API 응답 타입
interface KakaoUserResponse {
  id: number;
  kakao_account?: {
    email?: string;
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  // 언어(lang)에 따라 단어장 선택 로직 적용
  private generateRandomNickname(lang: string = 'ko'): string {
    // 지원하지 않는 언어가 오면 기본값 'ko' 사용
    const targetLang = lang in NICKNAME_DATA ? lang : 'ko';

    // 해당 언어의 단어장 가져오기
    const data = NICKNAME_DATA[targetLang];

    const randomAdjective =
      data.adjectives[Math.floor(Math.random() * data.adjectives.length)];
    const randomAnimal =
      data.animals[Math.floor(Math.random() * data.animals.length)];

    return `${randomAdjective} ${randomAnimal}`; // "행복한 쿼카" or "幸せな クオッカ"
  }

  // 회원가입
  async signUp(createUserDto: CreateUserDto): Promise<void> {
    const { email, password, nickname, language } = createUserDto;

    let hashedPassword: string | null = null; // 소셜 로그인 시 비번이 없을 수 있으니 null 허용

    if (password) {
      const salt = await bcrypt.genSalt(); //비밀번호가 존재하면 해싱
      hashedPassword = await bcrypt.hash(password, salt);
    } else {
      throw new BadRequestException('비밀번호는 필수입니다.'); // 소셜 로그인 아닌 경우 비번 필수
    }

    const finalNickname = nickname
      ? nickname
      : this.generateRandomNickname(language); // 닉네임이 없으면 랜덤 생성

    const user = this.usersRepository.create({
      email,
      password: hashedPassword, // 해싱된 비밀번호 (문자열)
      nickname: finalNickname,
    });

    try {
      await this.usersRepository.save(user);
    } catch (error: unknown) {
      const dbError = error as { code?: string; errno?: number };
      if (dbError.code === 'ER_DUP_ENTRY' || dbError.errno === 1062) {
        throw new ConflictException('이미 사용 중인 이메일입니다.');
      } else {
        throw new InternalServerErrorException();
      }
    }
  }

  // 카카오 로그인
  // 인자에 language 추가 (기본값 'ko') -> Auth에서 넘어온 값을 받을 수 있게 됨
  async kakaoLogin(
    kakaoAccessToken: string,
    language: string = 'ko',
  ): Promise<KakaoLoginResponse> {
    let kakaoUser: KakaoUserResponse;
    try {
      const response = await axios.get<KakaoUserResponse>(
        'https://kapi.kakao.com/v2/user/me',
        {
          headers: { Authorization: `Bearer ${kakaoAccessToken}` },
        },
      );
      kakaoUser = response.data;
    } catch {
      throw new InternalServerErrorException('카카오 인증 실패');
    }

    const snsId = kakaoUser.id.toString();
    const email: string | null = kakaoUser.kakao_account?.email || null;

    // 언어 설정에 맞춰 랜덤 닉네임 생성
    const randomNickname = this.generateRandomNickname(language);

    let user = await this.usersRepository.findOne({ where: { sns_id: snsId } });

    if (!user) {
      if (email) {
        const existingUser = await this.usersRepository.findOne({
          where: { email },
        });
        if (existingUser) {
          existingUser.sns_id = snsId;
          existingUser.provider = 'KAKAO';
          user = await this.usersRepository.save(existingUser);
          return { message: '카카오 계정 연동 성공', user };
        }
      }

      user = this.usersRepository.create({
        email: email || `${snsId}@kakao.com`, // 이메일이 없으면 가짜 이메일 생성
        nickname: randomNickname,
        provider: 'KAKAO',
        sns_id: snsId,
        password: null,
      });
      await this.usersRepository.save(user);
    }
    return { message: '카카오 로그인 성공', user };
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findOne(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  // Refresh Token 저장 (해싱해서 저장)
  async updateRefreshToken(
    userId: number,
    refreshToken: string,
  ): Promise<void> {
    const salt = await bcrypt.genSalt();
    const hashedRefreshToken = await bcrypt.hash(refreshToken, salt);
    await this.usersRepository.update(userId, {
      refreshToken: hashedRefreshToken,
    });
  }

  // Refresh Token 삭제 (로그아웃)
  async removeRefreshToken(userId: number): Promise<void> {
    await this.usersRepository.update(userId, { refreshToken: null });
  }
}
