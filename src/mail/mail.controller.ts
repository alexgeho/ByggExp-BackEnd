import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { MailService } from './mail.service';
import { SendDemoRequestDto } from './dto/send-demo-request.dto';
import { Public } from '../common/decorators/public.decorator';

@Public()
@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('demo-request')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendDemoRequest(@Body() dto: SendDemoRequestDto) {
    await this.mailService.sendDemoRequestEmail({
      name: dto['f-name'],
      email: dto['f-email'],
      phone: dto['f-phone'],
    });

    return { success: true };
  }
}
