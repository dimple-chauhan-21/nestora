import { IsIn } from 'class-validator';

export class RaiseEmergencyAlertDto {
  @IsIn(['fire', 'medical', 'security', 'other'])
  type!: 'fire' | 'medical' | 'security' | 'other';
}
