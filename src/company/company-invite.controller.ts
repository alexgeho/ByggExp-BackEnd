import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CompanyService } from './company.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';

// Public endpoints for accepting a company invite (no auth — the invitee has no
// account yet). The admin User is created only when the invite is accepted.
@Public()
@Controller('company/invite')
export class CompanyInviteController {
  constructor(private readonly companyService: CompanyService) {}

  @Get(':token')
  getInvite(@Param('token') token: string) {
    return this.companyService.getInvite(token);
  }

  @Post(':token/accept')
  accept(@Param('token') token: string, @Body() dto: AcceptInviteDto) {
    return this.companyService.acceptInvite(token, dto);
  }
}
