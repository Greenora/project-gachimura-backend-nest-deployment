import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Party } from './entities/party.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { toPublicUser } from '../users/user-response.mapper';

@Injectable()
export class PartiesService {
  constructor(
    @InjectRepository(Party)
    private partyRepository: Repository<Party>,
    @InjectRepository(PartyMember)
    private partyMemberRepository: Repository<PartyMember>,
  ) {}

  private toPublicParty(party: Party) {
    return {
      ...party,
      host: toPublicUser(party.host),
    };
  }

  // 모임 생성 (파일 업로드 포함)
  async createWithFile(dto: CreatePartyDto, file?: any, hostId?: number) {
    console.log('DTO RAW:', dto);
    try {
      const {
        title,
        content,
        store_name,
        address,
        address_ko,
        address_jp,
        latitude,
        longitude,
        meetingDate,
        meetingTime,
      } = dto;

      if (!meetingDate || !meetingTime) {
        throw new Error('meetingDate와 meetingTime은 필수입니다');
      }
      if (!title) {
        throw new Error('title은 필수입니다');
      }

      const meetDate = new Date(`${meetingDate}T${meetingTime}:00`);

      const party = this.partyRepository.create({
        title,
        content,
        storeName: store_name,
        address: address || null,
        addressKo: address_ko || null,
        addressJp: address_jp || null,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        meetDate,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        thumbnailImage:
          file && typeof file.filename === 'string' ? file.filename : null,
        hostId: hostId,
        status: 'RECRUITING',
      } as Partial<Party>);

      const savedParty = await this.partyRepository.save(party);

      // 호스트를 파티 멤버로 자동 등록 (승인 상태)
      if (hostId) {
        const hostMember = this.partyMemberRepository.create({
          partyId: savedParty.id,
          userId: hostId,
          status: 'APPROVED',
          joinedAt: new Date(),
        });
        await this.partyMemberRepository.save(hostMember);
      }

      return savedParty;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(message);
    }
  }

  // 모임 목록 조회 (검색/정렬/모집중 필터)
  async findAll(
    search?: string,
    sort: string = 'latest',
    showCompleted: boolean = true,
  ) {
    // 검색 조건(OR)
    let where = search
      ? [
          { title: ILike(`%${search}%`) },
          { content: ILike(`%${search}%`) },
          { storeName: ILike(`%${search}%`) },
          { addressKo: ILike(`%${search}%`) },
          { addressJp: ILike(`%${search}%`) },
          { host: { nickname: ILike(`%${search}%`) } },
        ]
      : {};

    // 모집중 필터
    if (!showCompleted) {
      if (Array.isArray(where)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        where = where.map((w) => ({ ...w, status: 'RECRUITING' }));
      } else if (typeof where === 'object' && where !== null) {
        (where as Record<string, any>).status = 'RECRUITING';
      }
    }

    // 정렬 조건
    const order: Record<string, 'ASC' | 'DESC'> = {};
    if (sort === 'imminent') {
      order['meetDate'] = 'ASC'; // 가까운 일시순
    } else {
      order['createdAt'] = 'DESC'; // 최신 등록순
    }

    const parties = await this.partyRepository.find({
      where,
      relations: {
        host: true,
      },
      order,
    });

    return parties.map((party) => this.toPublicParty(party));
  }

  // 모임 상세 조회 (유저별 상태 포함)
  async findOne(partyId: number, userId?: number) {
    // 파티 정보 + 호스트 정보 조회
    const party = await this.partyRepository.findOne({
      where: { id: partyId },
      relations: ['host'],
    });

    if (!party) {
      throw new NotFoundException(`Party with ID ${partyId} not found`);
    }

    // 유저별 상태값 계산
    let isJoined = false;
    let isAccepted = false;
    let isRejected = false;
    let isHost = false;
    let memberStatus: string | null = null;

    if (userId) {
      // 내가 이 파티에 참여했는지 확인
      const memberRecord = await this.partyMemberRepository.findOne({
        where: {
          party: { id: partyId },
          user: { id: userId },
        },
      });
      if (memberRecord) {
        isJoined = true;
        memberStatus = memberRecord.status;
        isAccepted = memberRecord.status === 'APPROVED';
        isRejected = memberRecord.status === 'REJECTED';
      }
      isHost = party.host.id === userId;
    }

    return {
      id: party.id,
      title: party.title,
      content: party.content,
      meetingDate: party.meetDate,
      status: party.status,
      capacity: party.capacity,
      currentCount: party.currentCount,
      images: party.thumbnailImage ? [party.thumbnailImage] : [],
      location: {
        name: party.storeName || '장소 미정',
        address: party.address || '',
        addressKo: party.addressKo || '',
        addressJp: party.addressJp || '',
        lat: party.latitude ? Number(party.latitude) : 0,
        lng: party.longitude ? Number(party.longitude) : 0,
      },
      host: {
        id: party.host.id,
        nickname: party.host.nickname,
        nickname_jp: party.host.nickname_jp || party.host.nickname,
        avatarUrl: party.host.profileImage || null,
      },
      isJoined,
      isAccepted,
      isRejected,
      isHost,
      memberStatus,
    };
  }

  update(id: number, updatePartyDto: UpdatePartyDto) {
    return this.partyRepository.update(id, updatePartyDto);
  }

  async findAllByUser(userId: number) {
    const parties = await this.partyRepository.find({
      where: { hostId: userId },
      relations: {
        host: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    return parties.map((party) => this.toPublicParty(party));
  }

  remove(id: number) {
    return this.partyRepository.delete(id);
  }

  async findJoinedParties(userId: number) {
    const memberships = await this.partyMemberRepository.find({
      where: { userId, status: 'APPROVED' },
      relations: ['party', 'party.host'],
      order: { party: { meetDate: 'DESC' } },
    });
    return memberships
      .filter((membership) => Boolean(membership.party))
      .map((membership) => this.toPublicParty(membership.party));
  }

  async joinParty(partyId: number, userId: number) {
    const party = await this.partyRepository.findOne({
      where: { id: partyId },
    });

    if (!party) {
      throw new NotFoundException('해당 모임을 찾을 수 없습니다.');
    }

    if (party.status !== 'RECRUITING') {
      throw new BadRequestException('현재 모집 중이 아닌 모임입니다.');
    }

    const existingMember = await this.partyMemberRepository.findOne({
      where: {
        party: { id: partyId },
        user: { id: userId },
      },
    });

    if (existingMember) {
      throw new BadRequestException('이미 신청한 모임입니다.');
    }

    if (party.hostId === userId) {
      throw new BadRequestException('본인이 생성한 모임입니다.');
    }

    const newMember = this.partyMemberRepository.create({
      party: { id: partyId },
      user: { id: userId },
      status: 'PENDING',
      joinedAt: new Date(),
    });

    await this.partyMemberRepository.save(newMember);

    return { message: '가입 신청이 완료되었습니다!' };
  }
  async updateStatus(partyId: number, status: string, userId: number) {
    const party = await this.partyRepository.findOne({
      where: { id: partyId },
    });

    if (!party) {
      throw new NotFoundException('해당 모임을 찾을 수 없습니다.');
    }

    if (party.hostId !== userId) {
      throw new BadRequestException('모임 상태를 변경할 권한이 없습니다.');
    }

    party.status = status;
    return this.partyRepository.save(party);
  }
}
