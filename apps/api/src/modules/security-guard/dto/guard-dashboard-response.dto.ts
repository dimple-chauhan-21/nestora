import { ApiProperty } from '@nestjs/swagger';
import { VisitResponseDto } from '../../visitor/dto/visit-response.dto';
import { DeliveryResponseDto } from '../../delivery/dto/delivery-response.dto';
import { EmergencyAlertResponseDto } from './emergency-alert-response.dto';

export class GuardDashboardResponseDto {
  @ApiProperty()
  gateId!: string;

  /** Null only if the guard hasn't been assigned a gate yet (shouldn't happen post-login, but the guard row itself allows it). */
  @ApiProperty({ type: String, nullable: true })
  gateName!: string | null;

  @ApiProperty()
  societyId!: string;

  @ApiProperty({ type: [VisitResponseDto] })
  pendingVisits!: VisitResponseDto[];

  @ApiProperty({ type: [DeliveryResponseDto] })
  pendingDeliveries!: DeliveryResponseDto[];

  @ApiProperty()
  escalatedJustNow!: number;

  @ApiProperty({ type: [EmergencyAlertResponseDto] })
  activeAlerts!: EmergencyAlertResponseDto[];

  @ApiProperty()
  todayEntries!: number;

  @ApiProperty()
  todayExits!: number;
}
