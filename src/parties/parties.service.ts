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

  create(createPartyDto: CreatePartyDto) {
    const newParty = this.partyRepository.create(createPartyDto);
    return this.partyRepository.save(newParty);
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
