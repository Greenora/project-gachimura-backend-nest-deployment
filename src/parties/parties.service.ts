import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Party } from './entities/party.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';

@Injectable()
export class PartiesService {
  constructor(
    @InjectRepository(Party)
    private partyRepository: Repository<Party>,
    @InjectRepository(PartyMember)
    private partyMemberRepository: Repository<PartyMember>,
  ) {}

  async createWithFile(
    dto: CreatePartyDto,
    file?: Express.Multer.File,
    hostId?: number,
  ) {
    console.log('DTO RAW:', dto);

    try {
      const {
        title,
        content,
        store_name,
        address,
        latitude,
        longitude,
        meetingDate,
        meetingTime,
      } = dto;

      if (!meetingDate || !meetingTime) {
        throw new Error('meetingDate and meetingTime are required');
      }

      if (!title) {
        throw new Error('title is required');
      }

      const meetDate = new Date(`${meetingDate}T${meetingTime}:00`);

      const party = this.partyRepository.create({
        title,
        content,
        storeName: store_name,
        address: address || null,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        meetDate,
        thumbnailImage: file?.filename ?? null,
        hostId: hostId,
        status: 'RECRUITING',
      } as Partial<Party>);

      return this.partyRepository.save(party);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(message);
    }
  }

  findAll() {
    return this.partyRepository.find();
  }

  async findOne(partyId: number, userId: number) {
    // 파티 정보 + 호스트 정보 가져오기
    const party = await this.partyRepository.findOne({
      where: { id: partyId },
      relations: ['host'], // 호스트 닉네임, 프사 정보 포함
    });

    if (!party) {
      throw new NotFoundException(`Party with ID ${partyId} not found`);
    }

    // 내가 이 파티에 참여했나?
    const memberRecord = await this.partyMemberRepository.findOne({
      where: {
        party: { id: partyId },
        user: { id: userId },
      },
    });

    const isJoined = !!memberRecord; // 참여 여부

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
        // 지도용 좌표 정보 (구글맵)
        name: party.storeName || '장소 미정',
        address: party.address || '',
        lat: party.latitude ? Number(party.latitude) : 0,
        lng: party.longitude ? Number(party.longitude) : 0,
      },
      host: {
        // 호스트 정보
        id: party.host.id,
        nickname: party.host.nickname,
        avatarUrl: party.host.profileImage || null,
      },
      isJoined: isJoined,
      isHost: party.host.id === userId,
    };
  }

  update(id: number, updatePartyDto: UpdatePartyDto) {
    return this.partyRepository.update(id, updatePartyDto);
  }

  remove(id: number) {
    return this.partyRepository.delete(id);
  }

  // ...existing code... (마지막에 추가)

  async joinParty(partyId: number, userId: number) {
    // 1. 파티가 존재하는지 확인
    const party = await this.partyRepository.findOne({
      where: { id: partyId },
    });

    if (!party) {
      throw new NotFoundException('해당 모임을 찾을 수 없습니다.');
    }

    if (party.status !== 'RECRUITING') {
      throw new BadRequestException('현재 모집 중이 아닌 모임입니다.');
    }

    // 2. 이미 가입한 멤버인지 확인
    const existingMember = await this.partyMemberRepository.findOne({
      where: {
        party: { id: partyId },
        user: { id: userId },
      },
    });

    if (existingMember) {
      throw new BadRequestException('이미 신청한 모임입니다.');
    }

    // 3. 호스트인지 확인 (호스트는 자동으로 승인된 멤버)
    if (party.hostId === userId) {
      throw new BadRequestException('본인이 생성한 모임입니다.');
    }

    // 4. 새 멤버 추가
    const newMember = this.partyMemberRepository.create({
      party: { id: partyId },
      user: { id: userId },
      status: 'PENDING', // 대기 상태로 시작
      joinedAt: new Date(),
    });

    await this.partyMemberRepository.save(newMember);

    return { message: '가입 신청이 완료되었습니다!' };
  }
}
