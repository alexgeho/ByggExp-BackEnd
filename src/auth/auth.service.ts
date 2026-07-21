import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { CompanyService } from '../company/company.service';
import { RegisterCompanyWithAdminDto } from '../company/dto/register-company-with-admin.dto';
import { RegisterCompanyPublicDto } from './dto/register-company-public.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UserAccountStatus, UserRole } from '../users/schemas/user.schema';
import { UserActivityLogLevel } from '../users/schemas/user-activity-log.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private companyService: CompanyService,
    private jwtService: JwtService,
  ) {}

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private async comparePasswords(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }

  // Регистрация нового пользователя
  async register(createUserDto: CreateUserDto) {
    const { email, password, ...userData } = createUserDto;

    if (!password) {
      throw new ConflictException('Password is required');
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new ConflictException('Email already exists');

    const hashedPassword = await this.hashPassword(password);

    const user = await this.usersService.create({
      ...userData,
      email,
      password: hashedPassword,
    });

    return this.generateTokens(user);
  }

  async registerCompany(dto: RegisterCompanyPublicDto) {
    const fullDto: RegisterCompanyWithAdminDto = {
      name: dto.companyName.trim(),
      address: '—',
      email: dto.email.trim().toLowerCase(),
      adminName: dto.userName.trim(),
      adminEmail: dto.email.trim().toLowerCase(),
      adminPassword: randomBytes(18).toString('base64url'),
    };

    const { admin } = await this.companyService.registerCompanyWithAdmin(fullDto);
    return this.generateTokens(admin);
  }

  // Регистрация SuperAdmin (только первый раз)
  async registerSuperAdmin(createUserDto: CreateUserDto) {
    const { email, password, ...userData } = createUserDto;

    if (!password) {
      throw new ConflictException('Password is required');
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new ConflictException('Email already exists');

    // Проверяем, есть ли уже супер-admin
    const superAdmins = await this.usersService.findAllByRole(UserRole.SuperAdmin);
    if (superAdmins.length > 0) {
      throw new ConflictException('SuperAdmin already exists. Use existing SuperAdmin to create new companies.');
    }

    const hashedPassword = await this.hashPassword(password);

    const user = await this.usersService.create({
      ...userData,
      email,
      password: hashedPassword,
      role: UserRole.SuperAdmin,
      companyId: null,
      projectIds: [],
    });

    return this.generateTokens(user);
  }

  async login(email: string, password: string) {
    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedPassword = password?.trim();
    const user = await this.usersService.findByEmail(normalizedEmail);

    const isMatch =
      user &&
      normalizedPassword &&
      (await this.comparePasswords(normalizedPassword, user.password));

    if (!user || !isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Invite users start as waiting_for_approval. Allow email+password login
    // (admin/app) and activate the account on first successful password sign-in.
    if (user.accountStatus === UserAccountStatus.WaitingForApproval) {
      await this.usersService.activateInvitedUser(user._id.toString());
      user.accountStatus = UserAccountStatus.Active;
    }

    try {
      await this.usersService.logActivity(user._id.toString(), {
        category: 'auth',
        type: 'login_succeeded',
        level: UserActivityLogLevel.Info,
        message: 'User logged in successfully.',
        source: 'backend',
        details: {
          method: 'password',
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to store login activity for user ${user._id.toString()}`);
    }

    return this.generateTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken) as JwtPayload;
      const user = await this.usersService.findOne(payload.sub);
      if (!user) throw new UnauthorizedException();
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private generateTokens(user: any) {
    const id = user._id ? user._id.toString() : user.id;
    const email = user.email;
    const role = user.role;
    const companyId = user.companyId;

    const payload: JwtPayload = { sub: id, email, role };
    const access_token = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refresh_token = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      user: {
        id,
        email,
        name: user.name,
        role,
        companyId,
      },
      access_token,
      refresh_token,
    };
  }

  async validateUser(id: string) {
    return this.usersService.findOne(id);
  }

  async verifyEmail(token: string) {
    const { user, magicLoginCode } =
      await this.usersService.verifyEmailByToken(token);

    return {
      success: true,
      message:
        'Email confirmed. Opening ByggExp to sign you in automatically.',
      magicLoginCode,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
      },
    };
  }

  async magicLogin(code: string) {
    const user = await this.usersService.consumeMagicLoginCode(code);

    try {
      await this.usersService.logActivity(user._id.toString(), {
        category: 'auth',
        type: 'magic_login_succeeded',
        level: UserActivityLogLevel.Info,
        message: 'User signed in via email verification link.',
        source: 'backend',
      });
    } catch (error) {
      this.logger.warn(
        `Failed to store magic login activity for user ${user._id.toString()}`,
      );
    }

    return this.generateTokens(user);
  }

  async validateUserForLocal(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (user && await this.comparePasswords(password, user.password)) {
      const { password: _, ...safeUser } = user.toObject
        ? user.toObject()
        : { ...user };
      return safeUser;
    }
    return null;
  }
}
