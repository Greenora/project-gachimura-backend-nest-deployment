export class CreatePartyDto {
  title: string;
  content?: string;
  store_name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;

  meetingDate: string;
  meetingTime: string;
}
