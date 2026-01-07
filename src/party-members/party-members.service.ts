import { Injectable } from '@nestjs/common';
import { CreatePartyMemberDto } from './dto/create-party-member.dto';
import { UpdatePartyMemberDto } from './dto/update-party-member.dto';

@Injectable()
export class PartyMembersService {
  create(createPartyMemberDto: CreatePartyMemberDto) {
    return 'This action adds a new partyMember';
  }

  findAll() {
    return `This action returns all partyMembers`;
  }

  findOne(id: number) {
    return `This action returns a #${id} partyMember`;
  }

  update(id: number, updatePartyMemberDto: UpdatePartyMemberDto) {
    return `This action updates a #${id} partyMember`;
  }

  remove(id: number) {
    return `This action removes a #${id} partyMember`;
  }
}
