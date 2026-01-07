import { PartialType } from '@nestjs/mapped-types';
import { CreatePartyMemberDto } from './create-party-member.dto';

export class UpdatePartyMemberDto extends PartialType(CreatePartyMemberDto) {}
