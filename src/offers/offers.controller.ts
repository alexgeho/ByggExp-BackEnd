import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { OffersService } from './offers.service';

@Controller('offers')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findAllAccessible(@Request() req) {
    return this.offersService.findAccessible(req.user);
  }

  @Get('next-number')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  getNextOfferNumber(@Request() req, @Query('companyId') companyId?: string) {
    return this.offersService.getNextOfferNumberForUser(req.user, companyId);
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  create(@Request() req, @Body() createOfferDto: CreateOfferDto) {
    return this.offersService.create(createOfferDto, req.user);
  }

  @Post(':id/copy')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  copy(@Request() req, @Param('id') id: string) {
    return this.offersService.copy(id, req.user);
  }

  @Get(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findOne(@Request() req, @Param('id') id: string) {
    return this.offersService.findOne(id, req.user);
  }

  @Put(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateOfferDto: UpdateOfferDto,
  ) {
    return this.offersService.update(id, updateOfferDto, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  remove(@Request() req, @Param('id') id: string) {
    return this.offersService.remove(id, req.user);
  }
}
