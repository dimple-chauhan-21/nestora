import { Controller } from '@nestjs/common';
import { ElectricityService } from './electricity.service';

@Controller('electricity')
export class ElectricityController {
  constructor(private readonly electricityService: ElectricityService) {}
}
