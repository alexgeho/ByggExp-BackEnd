import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UserRole } from '../users/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
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

  // Регистрация SuperAdmin (только первый раз)
  async registerSuperAdmin(createUserDto: CreateUserDto) {
    const { email, password, ...userData } = createUserDto;

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
    const user = await this.usersService.findByEmail(email);

    const isMatch = user && await this.comparePasswords(password, user.password);

    if (!user || !isMatch) {
      throw new UnauthorizedException('Invalid credentials');
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
