import { Controller } from '@nestjs/common';
import { LostFoundService } from './lost-found.service';

@Controller('lost-found')
export class LostFoundController {
  constructor(private readonly lostfoundService: LostFoundService) {}
}
