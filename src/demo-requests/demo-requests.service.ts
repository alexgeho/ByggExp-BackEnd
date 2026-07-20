import { Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';

@Injectable()
export class DemoRequestsService {
  constructor(private readonly mailService: MailService) {}

  async create(dto: CreateDemoRequestDto): Promise<{ success: true }> {
    await this.mailService.sendDemoRequestEmail({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
    });

    return { success: true };
  }
}
