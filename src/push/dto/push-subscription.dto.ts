import { Type } from 'class-transformer';
import {
  IsDefined,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class PushSubscriptionKeysDto {
  @IsString()
  @MaxLength(128)
  p256dh: string;

  @IsString()
  @MaxLength(64)
  auth: string;
}

export class DeletePushSubscriptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  endpoint: string;
}

export class CreatePushSubscriptionDto extends DeletePushSubscriptionDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}
