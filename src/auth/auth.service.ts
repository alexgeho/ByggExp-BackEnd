import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes } from "crypto";
import * as bcrypt from "bcrypt";
import { UsersService } from "../users/users.service";
import { CompanyService } from "../company/company.service";
import { RegisterCompanyWithAdminDto } from "../company/dto/register-company-with-admin.dto";
import { RegisterCompanyPublicDto } from "./dto/register-company-public.dto";
import { CreateUserDto } from "../users/dto/create-user.dto";
import { JwtPayload } from "./interfaces/jwt-payload.interface";
import { UserAccountStatus, UserRole } from "../users/schemas/user.schema";
import { getEffectivePermissions } from "../common/permissions/permissions.constants";
import { UserActivityLogLevel } from "../users/schemas/user-activity-log.schema";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private companyService: CompanyService,
    private jwtService: JwtService,
  ) {}

  // In-memory brute-force protection for password login, keyed by email so it
  // works regardless of the reverse proxy's IP. Single-instance (PM2); move to
  // Redis if the API is ever horizontally scaled.
  private readonly loginAttempts = new Map<
    string,
    { count: number; firstAt: number; lockedUntil: number }
  >();
  private static readonly MAX_LOGIN_ATTEMPTS = 8;
  private static readonly LOGIN_WINDOW_MS = 10 * 60 * 1000;
  private static readonly LOGIN_LOCK_MS = 10 * 60 * 1000;

  private assertLoginAllowed(email: string): void {
    const record = this.loginAttempts.get(email);
    if (!record) return;
    const now = Date.now();
    if (record.lockedUntil > now) {
      const minutes = Math.ceil((record.lockedUntil - now) / 60000);
      throw new HttpException(
        `För många inloggningsförsök. Försök igen om ${minutes} minut(er).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Window elapsed and not locked → forget the old failures.
    if (now - record.firstAt > AuthService.LOGIN_WINDOW_MS) {
      this.loginAttempts.delete(email);
    }
  }

  private registerLoginFailure(email: string): void {
    const now = Date.now();
    const record = this.loginAttempts.get(email);
    if (!record || now - record.firstAt > AuthService.LOGIN_WINDOW_MS) {
      this.loginAttempts.set(email, { count: 1, firstAt: now, lockedUntil: 0 });
      return;
    }
    record.count += 1;
    if (record.count >= AuthService.MAX_LOGIN_ATTEMPTS) {
      record.lockedUntil = now + AuthService.LOGIN_LOCK_MS;
    }
  }

  private clearLoginFailures(email: string): void {
    this.loginAttempts.delete(email);
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private async comparePasswords(
    plain: string,
    hashed: string,
  ): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }

  // Register a new user
  async register(createUserDto: CreateUserDto) {
    // Public self-registration: NEVER trust caller-supplied privileged fields.
    // A self-registered account is always a company-less Worker; role, company
    // and project membership are assigned later by an admin via authenticated
    // endpoints (POST /users). Stripping these closes a full-takeover hole where
    // an unauthenticated request could create a superadmin or join any company.
    const {
      email,
      password,
      role: _ignoredRole,
      companyId: _ignoredCompanyId,
      projectIds: _ignoredProjectIds,
      ...userData
    } = createUserDto;

    if (!password) {
      throw new ConflictException("Password is required");
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new ConflictException("Email already exists");

    const hashedPassword = await this.hashPassword(password);

    const user = await this.usersService.create({
      ...userData,
      email,
      password: hashedPassword,
      role: UserRole.Worker,
      companyId: null,
      projectIds: [],
    });

    return this.generateTokens(user);
  }

  async registerCompany(dto: RegisterCompanyPublicDto) {
    // The mobile app signs up without a password and relies on the tokens we
    // return here (and magic-login later). Generate a strong random password
    // when the client didn't supply one so the account always has a credential.
    const adminPassword =
      dto.password ?? randomBytes(24).toString("base64url");

    const fullDto: RegisterCompanyWithAdminDto = {
      name: dto.companyName.trim(),
      address: "—",
      email: dto.email.trim().toLowerCase(),
      adminName: dto.userName.trim(),
      adminEmail: dto.email.trim().toLowerCase(),
      adminPassword,
    };

    const { admin } =
      await this.companyService.registerCompanyWithAdmin(fullDto);
    return this.generateTokens(admin);
  }

  // Register the SuperAdmin (first-time only)
  async registerSuperAdmin(createUserDto: CreateUserDto) {
    const { email, password, ...userData } = createUserDto;

    if (!password) {
      throw new ConflictException("Password is required");
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing) throw new ConflictException("Email already exists");

    // Check whether a superadmin already exists
    const superAdmins = await this.usersService.findAllByRole(
      UserRole.SuperAdmin,
    );
    if (superAdmins.length > 0) {
      throw new ConflictException(
        "SuperAdmin already exists. Use existing SuperAdmin to create new companies.",
      );
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
    const normalizedEmail = email?.trim().toLowerCase() || "";
    const normalizedPassword = password?.trim();

    // Reject early if this email is temporarily locked from too many failures.
    this.assertLoginAllowed(normalizedEmail);

    // Email is unique per company, so one email may map to several accounts
    // (one per company). Pick the account whose password matches. In practice a
    // returning worker gets a fresh password at the new employer, so exactly one
    // account matches.
    const candidates = await this.usersService.findAllByEmail(normalizedEmail);

    let user: (typeof candidates)[number] | null = null;
    if (normalizedPassword) {
      for (const candidate of candidates) {
        if (await this.comparePasswords(normalizedPassword, candidate.password)) {
          user = candidate;
          break;
        }
      }
    }

    if (!user) {
      this.registerLoginFailure(normalizedEmail);
      throw new UnauthorizedException("Invalid credentials");
    }

    this.clearLoginFailures(normalizedEmail);

    // Invite users start as waiting_for_approval. Allow email+password login
    // (admin/app) and activate the account on first successful password sign-in.
    if (user.accountStatus === UserAccountStatus.WaitingForApproval) {
      await this.usersService.activateInvitedUser(user._id.toString());
      user.accountStatus = UserAccountStatus.Active;
    }

    try {
      await this.usersService.logActivity(user._id.toString(), {
        category: "auth",
        type: "login_succeeded",
        level: UserActivityLogLevel.Info,
        message: "User logged in successfully.",
        source: "backend",
        details: {
          method: "password",
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to store login activity for user ${user._id.toString()}`,
      );
    }

    return this.generateTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await this.usersService.findOne(payload.sub);
      if (!user) throw new UnauthorizedException();
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  private generateTokens(user: any) {
    const id = user._id ? user._id.toString() : user.id;
    const email = user.email;
    const role = user.role;
    const companyId = user.companyId;

    const payload: JwtPayload = { sub: id, email, role };
    const access_token = this.jwtService.sign(payload, { expiresIn: "15m" });
    const refresh_token = this.jwtService.sign(payload, { expiresIn: "7d" });

    return {
      user: {
        id,
        email,
        name: user.name,
        role,
        companyId,
        // Effective capabilities (role defaults ∪ granted − revoked) so the
        // client can gate features like invoicing without re-deriving the map.
        effectivePermissions: Array.from(
          getEffectivePermissions(role, user.permissions),
        ),
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
      message: "Email confirmed. Opening ByggExp to sign you in automatically.",
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
        category: "auth",
        type: "magic_login_succeeded",
        level: UserActivityLogLevel.Info,
        message: "User signed in via email verification link.",
        source: "backend",
      });
    } catch (error) {
      this.logger.warn(
        `Failed to store magic login activity for user ${user._id.toString()}`,
      );
    }

    return this.generateTokens(user);
  }

  async validateUserForLocal(email: string, password: string) {
    // One email can map to several accounts (unique per company); return the
    // one whose password matches.
    const candidates = await this.usersService.findAllByEmail(email);
    for (const user of candidates) {
      if (await this.comparePasswords(password, user.password)) {
        const { password: _, ...safeUser } = user.toObject
          ? user.toObject()
          : { ...user };
        return safeUser;
      }
    }
    return null;
  }
}
