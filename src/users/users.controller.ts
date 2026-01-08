import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get(':id')
  @ApiOperation({ summary: '특정 유저 조회', description: 'ID를 기반으로 특정 유저의 상세 정보를 가져옵니다.' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }
}
