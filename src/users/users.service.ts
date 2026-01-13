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

  // 언어별 닉네임 쌍(Pair) 생성 로직으로 변경
  private generateRandomNicknamePair(): { ko: string; jp: string } {
    const koData = NICKNAME_DATA['ko'];
    const jpData = NICKNAME_DATA['jp']; // nickname.constants.ts에 jp 데이터가 있어야 함

    // 랜덤 인덱스 뽑기 (한 번 뽑아서 둘 다 씀)
    const adjIndex = Math.floor(Math.random() * koData.adjectives.length);
    const aniIndex = Math.floor(Math.random() * koData.animals.length);

    // 한국어 닉네임 조합
    const koNick = `${koData.adjectives[adjIndex]} ${koData.animals[aniIndex]}`;

    // 일본어 닉네임 조합 (데이터가 없으면 한국어 그대로 사용)
    const jpNick = jpData
      ? `${jpData.adjectives[adjIndex]} ${jpData.animals[aniIndex]}`
      : koNick;

    return { ko: koNick, jp: jpNick };
  }

  // 회원가입
  async signUp(createUserDto: CreateUserDto): Promise<void> {
    const { email, password, nickname } = createUserDto; // language는 이제 닉네임 생성에 쓰이지 않으므로 제거해도 됨

    let hashedPassword: string | null = null;

    if (password) {
      const salt = await bcrypt.genSalt();
      hashedPassword = await bcrypt.hash(password, salt);
    } else {
      throw new BadRequestException('비밀번호는 필수입니다.');
    }

    // 닉네임 처리 로직
    let finalNickname = nickname;
    let finalNicknameJp = nickname; // 직접 입력하면 일어 닉네임도 똑같이 설정

    // 닉네임이 없을 때만 랜덤 생성 (쌍으로 생성)
    if (!nickname) {
      const pair = this.generateRandomNicknamePair();
      finalNickname = pair.ko;
      finalNicknameJp = pair.jp;
    }

    const user = this.usersRepository.create({
      email,
      password: hashedPassword,
      nickname: finalNickname,
      nickname_jp: finalNicknameJp, // User Entity에 이 컬럼이 있어야 함
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

    // 랜덤 닉네임 쌍 생성 (여기서는 항상 랜덤이므로)
    const randomNickPair = this.generateRandomNicknamePair();

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

      // 신규 유저 생성
      user = this.usersRepository.create({
        email: email || `${snsId}@kakao.com`,
        nickname: randomNickPair.ko,    // 한국어
        nickname_jp: randomNickPair.jp, // 일본어
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

  // Refresh Token 저장
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

  // Refresh Token 삭제
  async removeRefreshToken(userId: number): Promise<void> {
    await this.usersRepository.update(userId, { refreshToken: null });
  }
}