import { IsIn } from 'class-validator';

export class ResolveViolationDto {
  @IsIn(['resolved', 'dismissed'])
  status!: 'resolved' | 'dismissed';
}
