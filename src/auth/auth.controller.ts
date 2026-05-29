import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { RegisterCompanyPublicDto } from './dto/register-company-public.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post('register-company')
  registerCompany(@Body() dto: RegisterCompanyPublicDto) {
    return this.authService.registerCompany(dto);
  }

  @Post('register-superadmin')
  registerSuperAdmin(@Body() createUserDto: CreateUserDto) {
    return this.authService.registerSuperAdmin(createUserDto);
  }

  @Post('login')
  async login(@Body() loginDto: { email: string; password: string }) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @Post('refresh')
  refresh(@Body('refresh_token') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }
}