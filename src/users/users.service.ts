import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt'; // 비밀번호 암호화 라이브러리
import * as qs from 'qs'; // URL 쿼리스트링 변환 라이브러리
import axios from 'axios'; // HTTP 요청 라이브러리 (카카오/LINE API 호출용)
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { NICKNAME_DATA } from './nickname.constants';
import { UpdateProfileDto } from './dto/update-profile.dto';

// 카카오 로그인 응답 타입
export interface KakaoLoginResponse {
  message: string;
  user: User;
}

// 카카오 API 유저 정보 타입
interface KakaoUserResponse {
  id: number;
  kakao_account?: {
    email?: string;
  };
}

interface KakaoTokenResponse {
  access_token: string;
}

// 유저 비즈니스 로직 처리 (회원가입, 소셜 로그인, 토큰 관리)
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  // 랜덤 닉네임 생성 (한/일 동시)
  private generateRandomNicknamePair(): { ko: string; jp: string } {
    const koData = NICKNAME_DATA['ko'];
    const jpData = NICKNAME_DATA['jp'];

    const adjIndex = Math.floor(Math.random() * koData.adjectives.length);
    const aniIndex = Math.floor(Math.random() * koData.animals.length);

    const koNick = `${koData.adjectives[adjIndex]} ${koData.animals[aniIndex]}`;

    const jpNick = jpData
      ? `${jpData.adjectives[adjIndex]} ${jpData.animals[aniIndex]}`
      : koNick;

    return { ko: koNick, jp: jpNick };
  }

  // 이메일 회원가입 (비밀번호 bcrypt 암호화, 닉네임 랜덤 생성)
  async signUp(createUserDto: CreateUserDto): Promise<void> {
    const { email, password, nickname } = createUserDto;

    let hashedPassword: string | null = null;

    if (password) {
      const salt = await bcrypt.genSalt();
      hashedPassword = await bcrypt.hash(password, salt);
    } else {
      throw new BadRequestException('비밀번호는 필수입니다.');
    }

    let finalNickname = nickname;
    let finalNicknameJp = nickname;

    if (!nickname) {
      const pair = this.generateRandomNicknamePair();
      finalNickname = pair.ko;
      finalNicknameJp = pair.jp;
    }

    const user = this.usersRepository.create({
      email,
      password: hashedPassword,
      nickname: finalNickname,
      nickname_jp: finalNicknameJp,
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

  // 카카오 로그인 (인가 코드 → 토큰 교환 → 신규면 자동 가입)
  async kakaoLogin(
    code: string,
    redirectUri: string,
    _language: string = 'ko',
  ): Promise<KakaoLoginResponse> {
    const clientId = this.configService.get<string>('KAKAO_CLIENT_ID');
    const clientSecret = this.configService.get<string>('KAKAO_CLIENT_SECRET');

    if (!clientId) {
      throw new InternalServerErrorException(
        '카카오 클라이언트 ID가 설정되지 않았습니다.',
      );
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
    });

    if (clientSecret) {
      tokenParams.set('client_secret', clientSecret);
    }

    let kakaoAccessToken: string;
    try {
      const tokenResponse = await axios.post<KakaoTokenResponse>(
        'https://kauth.kakao.com/oauth/token',
        tokenParams.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
          },
        },
      );
      kakaoAccessToken = tokenResponse.data.access_token;
    } catch {
      throw new BadRequestException(
        '유효하지 않거나 만료된 카카오 인가 코드입니다.',
      );
    }

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
      throw new UnauthorizedException('카카오 사용자 인증에 실패했습니다.');
    }

    const snsId = kakaoUser.id.toString();
    const email: string | null = kakaoUser.kakao_account?.email || null;

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

      user = this.usersRepository.create({
        email: email || `${snsId}@kakao.com`,
        nickname: randomNickPair.ko,
        nickname_jp: randomNickPair.jp,
        provider: 'KAKAO',
        sns_id: snsId,
        password: null,
      });
      await this.usersRepository.save(user);
    }
    return { message: '카카오 로그인 성공', user };
  }

  // LINE 로그인 (인가 코드 → 토큰 교환 → 프로필 가져오기 → 신규면 자동 가입)
  async lineLogin(
    code: string,
    redirectUri: string,
    language: string = 'ko',
  ): Promise<{ user: User }> {
    try {
      // 1단계: 인가 코드로 액세스 토큰 받기 (qs.stringify로 form 데이터 생성)
      const tokenResponse = await axios.post(
        'https://api.line.me/oauth2/v2.1/token',
        qs.stringify({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          client_id: process.env.LINE_CHANNEL_ID,
          client_secret: process.env.LINE_CHANNEL_SECRET,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      const accessToken = tokenResponse.data.access_token;

      // 2단계: 액세스 토큰으로 유저 프로필 가져오기
      const profileResponse = await axios.get(
        'https://api.line.me/v2/profile',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      const lineUser = profileResponse.data;
      const snsId = lineUser.userId;

      const email = `${snsId}@line.me`;

      // 3단계: DB에서 유저 찾기 또는 신규 가입
      let user = await this.usersRepository.findOne({
        where: { sns_id: snsId },
      });

      if (!user) {
        const randomNickPair = this.generateRandomNicknamePair();

        user = this.usersRepository.create({
          email: email,
          nickname: randomNickPair.ko,
          nickname_jp: randomNickPair.jp,
          provider: 'LINE',
          sns_id: snsId,
          password: null,
        });
        await this.usersRepository.save(user);
      }

      return { user };
    } catch (error) {
      console.error('Line Login Error:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        '라인 로그인 처리 중 오류가 발생했습니다.',
      );
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findOne(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  // Refresh Token을 DB에 저장 (토큰 갱신 시 검증용)
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

  // Refresh Token 삭제 (로그아웃 시 호출)
  async removeRefreshToken(userId: number): Promise<void> {
    await this.usersRepository.update(userId, { refreshToken: null });
  }

  // 유저 정보 수정
  async update(id: number, updateData: Partial<User>): Promise<User | null> {
    await this.usersRepository.update(id, updateData);
    return this.findOne(id);
  }

  // 유저 위치 및 프로필 정보 업데이트
  async updateLocation(userId: number, data: UpdateProfileDto) {
    const updateFields: Partial<User> = {};

    if (data.latitude !== undefined) updateFields.latitude = data.latitude;
    if (data.longitude !== undefined) updateFields.longitude = data.longitude;
    if (data.region !== undefined) updateFields.region = data.region;
    if (data.district !== undefined) updateFields.district = data.district;
    if (data.accountCountry !== undefined)
      updateFields.accountCountry = data.accountCountry;
    if (data.bankCode !== undefined) updateFields.bankCode = data.bankCode;
    if (data.bankName !== undefined) updateFields.bankName = data.bankName;
    if (data.bankBranchName !== undefined)
      updateFields.bankBranchName = data.bankBranchName;
    if (data.bankBranchCode !== undefined)
      updateFields.bankBranchCode = data.bankBranchCode;
    if (data.accountType !== undefined)
      updateFields.accountType = data.accountType;
    if (data.accountNumber !== undefined)
      updateFields.accountNumber = data.accountNumber;
    if (data.accountHolder !== undefined)
      updateFields.accountHolder = data.accountHolder;
    if (data.nickname !== undefined) updateFields.nickname = data.nickname;
    if (data.nickname_jp !== undefined)
      updateFields.nickname_jp = data.nickname_jp;

    await this.usersRepository.update(userId, updateFields);

    return { success: true };
  }
}
