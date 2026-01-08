import { ConflictException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from 'bcrypt';
import { User } from "./entity/user.entity";
import { CreateUserDto } from "./dto/create-user.dto";
import axios from "axios";

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private usersRepository: Repository<User>,
    ) {}

    //회원가입
    async signUp(createUserDto: CreateUserDto): Promise<void> {
        const { email, password, nickname } = createUserDto;

        //비밀번호 암호화 (Salt 처리)
        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(password, salt);

        //유저 객체 생성
        const user = this.usersRepository.create({
            email,
            password: hashedPassword,
            nickname,
        });

        try{
            //db에 유저 저장
            await this.usersRepository.save(user);
        } catch (error) {
            //중복된 이메일 예외 처리
            if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
                throw new ConflictException('이미 사용중인 이메일입니다.');
        } else {
            throw new InternalServerErrorException();
        }
        }
    }

    async kakaoLogin(kakaoAccessToken: string):Promise<any> {
        let kakaoUser;
        try {
            const response = await axios.get('https://kapi.kakao.com/v2/user/me', {
                headers: {
                    Authorization: `Bearer ${kakaoAccessToken}`,
                }
            });
            kakaoUser = response.data;
        } catch (error) {
            throw new InternalServerErrorException('카카오 인증 실패');
        }

        const snsId = kakaoUser.id.toString();
        const email = kakaoUser.kakao_account?.email || null; //이메일은 선택동의라 없을 수도 있음
        const nickname = kakaoUser.kakao_account?.profile?.nickname || 'KakaoUser';

        let user = await this.usersRepository.findOne({ where: { sns_id: snsId } });

        //유저가 없으면 회원가입 처리
        if (!user) {
            user = this.usersRepository.create({
                email: email || `${snsId}@kakao.com`, //이메일이 없으면 가짜 이메일 생성
                nickname: nickname,
                provider: 'KAKAO',
                sns_id: snsId,
                password: null, //소셜 로그인은 비밀번호 없음
            });
            await this.usersRepository.save(user);
        }

        return { message: '카카오 로그인 성공', user};
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.usersRepository.findOne({ where: { email } });
    }
}