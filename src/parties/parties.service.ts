import { BadRequestException, Injectable } from '@nestjs/common';
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
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
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
