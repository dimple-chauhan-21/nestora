import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookService } from './webhook.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Public()
  @Post('payment-gateway')
  async handlePaymentGatewayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-gateway-signature') signature: string | undefined,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Raw body unavailable — check rawBody app option');
    }
    return this.webhookService.handlePaymentWebhook(req.rawBody, signature, {
      ip: req.ip ?? null,
      userAgent: Array.isArray(req.headers['user-agent'])
        ? (req.headers['user-agent'][0] ?? null)
        : (req.headers['user-agent'] ?? null),
    });
  }
}
