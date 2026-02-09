import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Party } from './entities/party.entity';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';

@Injectable()
export class PartiesService {
  constructor(
    @InjectRepository(Party)
    private partyRepository: Repository<Party>,
  ) { }

  create(createPartyDto: CreatePartyDto) {
    const newParty = this.partyRepository.create(createPartyDto);
    return this.partyRepository.save(newParty);
  }

  findAll(search?: string, sort: string = 'latest', showCompleted: boolean = true) {
    // 1. 기본 검색 조건 (OR 조건)
    let where: any = search ? [
      { title: ILike(`%${search}%`) },
      { content: ILike(`%${search}%`) },
      { storeName: ILike(`%${search}%`) },
      { addressKo: ILike(`%${search}%`) },
      { addressJp: ILike(`%${search}%`) },
      { host: { nickname: ILike(`%${search}%`) } },
    ] : {};

    // 2. 만료된 파티 안보기 필터링 (showCompleted === false 이면 모집중인것만)
    // where가 배열(OR)인 경우 각 항목에 status 조건을 추가해야 함
    if (!showCompleted) {
      if (Array.isArray(where)) {
        where = where.map(w => ({ ...w, status: 'RECRUITING' }));
      } else {
        where.status = 'RECRUITING';
      }
    }

    // 3. 정렬 조건식
    const order: any = {};
    if (sort === 'imminent') {
      order.meetDate = 'ASC'; // 가까운 일시순
    } else {
      order.createdAt = 'DESC'; // 최신 등록순
    }

    return this.partyRepository.find({
      where,
      relations: {
        host: true,
      },
      order,
    });
  }

  findOne(id: number) {
    return this.partyRepository.findOne({
      where: { id },
    });
  }

  update(id: number, updatePartyDto: UpdatePartyDto) {
    return this.partyRepository.update(id, updatePartyDto);
  }

  remove(id: number) {
    return this.partyRepository.delete(id);
  }
}
