import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PartyMembersService } from './party-members.service';
import { CreatePartyMemberDto } from './dto/create-party-member.dto';
import { UpdatePartyMemberDto } from './dto/update-party-member.dto';

@Controller('party-members')
export class PartyMembersController {
  constructor(private readonly partyMembersService: PartyMembersService) {}

  @Post()
  create(@Body() createPartyMemberDto: CreatePartyMemberDto) {
    return this.partyMembersService.create(createPartyMemberDto);
  }

  @Get()
  findAll() {
    return this.partyMembersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.partyMembersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePartyMemberDto: UpdatePartyMemberDto) {
    return this.partyMembersService.update(+id, updatePartyMemberDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.partyMembersService.remove(+id);
  }
}
