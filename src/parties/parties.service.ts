import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Party } from './entities/party.entity';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';

@Injectable()
export class PartiesService {
  constructor(
    @InjectRepository(Party)
    private partyRepository: Repository<Party>,
  ) {}

  async createWithFile(dto: CreatePartyDto, file?: any) {
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

    if (!meetingDate || !meetingTime) {
      throw new Error('meetingDate and meetingTime are required');
    }

    const meetDate = new Date(`${meetingDate}T${meetingTime}:00`);

    const DUMMY_HOST_ID = 1;

    const party = this.partyRepository.create({
      title,
      content,
      storeName: store_name,
      address,
      latitude,
      longitude,
      meetDate,
      thumbnailImage: file?.filename ?? null,
      hostId: DUMMY_HOST_ID,
      status: 'RECRUITING',
    });

    return this.partyRepository.save(party);
  }

  findAll() {
    return this.partyRepository.find();
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
