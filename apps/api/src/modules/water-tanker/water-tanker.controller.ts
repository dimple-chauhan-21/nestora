import { Controller } from '@nestjs/common';
import { WaterTankerService } from './water-tanker.service';

@Controller('water-tanker')
export class WaterTankerController {
  constructor(private readonly watertankerService: WaterTankerService) {}
}
