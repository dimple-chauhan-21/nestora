import { ApiProperty } from '@nestjs/swagger';

/** The pool a complaint's `assignedTo` can be set to — society_admin/society_manager, the same set ComplaintService already escalates SLA breaches to (MANAGER_ROLE_CODES), not every society-tier role (e.g. Committee/Accountant have read-only complaint access, not a work queue). */
export class AssignableStaffDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty()
  roleCode!: string;
}
