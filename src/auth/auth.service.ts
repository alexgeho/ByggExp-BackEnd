import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { randomBytes, createHash } from "crypto";
import * as bcrypt from "bcrypt";
import {
  PendingRegistration,
  PendingRegistrationDocument,
} from "./schemas/pending-registration.schema";
import { UsersService } from "../users/users.service";
import { CompanyService } from "../company/company.service";
import { RegisterCompanyWithAdminDto } from "../company/dto/register-company-with-admin.dto";
import { RegisterCompanyPublicDto } from "./dto/register-company-public.dto";
import { CreateUserDto } from "../users/dto/create-user.dto";
import { JwtPayload } from "./interfaces/jwt-payload.interface";
import { UserAccountStatus, UserRole } from "../users/schemas/user.schema";
import { getEffectivePermissions } from "../common/permissions/permissions.constants";
import { UserActivityLogLevel } from "../users/schemas/user-activity-log.schema";
import { ConfigService } from "@nestjs/config";
import { MailService } from "../mail/mail.service";
import { languageCode } from "../common/language";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private companyService: CompanyService,
    private jwtService: JwtService,
    private mailService: MailService,
    private configService: ConfigService,
    @InjectModel(PendingRegistration.name)
    private pendingRegistrationModel: Model<PendingRegistrationDocument>,
  ) {}

  // Simple in-memory rate limit for sign-up requests, keyed by email. Blunts a
  // bot spamming registrations; pending records also self-expire (TTL) and no
  // Company is created until the email is verified.
  private readonly registerAttempts = new Map<string, number[]>();
  private static readonly MAX_REGISTER_ATTEMPTS = 5;
  private static readonly REGISTER_WINDOW_MS = 10 * 60 * 1000;

  private assertRegisterAllowed(email: string): void {
    const now = Date.now();
    const recent = (this.registerAttempts.get(email) || []).filter(
      (t) => now - t < AuthService.REGISTER_WINDOW_MS,
    );
    if (recent.length >= AuthService.MAX_REGISTER_ATTEMPTS) {
      throw new HttpException(
        "Too many registration attempts. Please try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.registerAttempts.set(email, recent);
  }

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

  private static readonly TRIAL_DAYS = 14;
  private static readonly TRIAL_MAX_USERS = 10;

  // Step 1 of sign-up: DON'T create the company yet. Validate, store a pending
  // registration (with the user's chosen password hashed) and email a 6-digit
  // code. The company is only created once the code is verified — so spammed
  // sign-ups never create real tenants.
  async registerCompany(dto: RegisterCompanyPublicDto) {
    const email = dto.email.trim().toLowerCase();
    this.assertRegisterAllowed(email);

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException(
        "An account with this email already exists. Please log in instead.",
      );
    }

    // No password yet — the user sets it on the page opened from the emailed
    // link (step 2). We only store a hashed link token here.
    // Not a confirmed account, but a pending registration may already exist for
    // this email — surface that to the client so it can tell the user the link
    // is being re-sent instead of looking like a brand-new sign-up.
    const alreadyPending = !!(await this.pendingRegistrationModel.findOne({
      email,
    }));

    const companyName = dto.companyName.trim();
    const userName = (dto.userName || dto.companyName).trim();
    const plainToken = randomBytes(32).toString("hex");
    const codeHash = createHash("sha256").update(plainToken).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.pendingRegistrationModel.findOneAndUpdate(
      { email },
      {
        email,
        companyName,
        userName,
        passwordHash: null,
        codeHash,
        expiresAt,
        attempts: 0,
      },
      { upsert: true, new: true },
    );

    try {
      await this.mailService.sendCompanyVerificationEmail(
        email,
        userName,
        plainToken,
      );
    } catch (error) {
      this.logger.error(`Failed to send verification email: ${String(error)}`);
    }

    return { pendingVerification: true, email, alreadyPending };
  }

  private hashToken(token: string): string {
    return createHash("sha256")
      .update(String(token || "").trim())
      .digest("hex");
  }

  // Step 2a: the user clicked the link. Validate the token so the controller
  // can show the "choose a password" page. Returns the pending record.
  async getPendingByToken(token: string) {
    const pending = await this.pendingRegistrationModel
      .findOne({ codeHash: this.hashToken(token) })
      .exec();
    if (!pending || pending.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        "This confirmation link is invalid or has expired. Please sign up again.",
      );
    }
    return pending;
  }

  // Step 2b: the user submitted a password on the confirmation page. Create the
  // company + admin with that password and mint a magic code so the app can
  // sign them in via the deep link.
  async completeRegistration(
    token: string,
    password: string,
  ): Promise<{ magicLoginCode: string }> {
    if (!password || password.length < 6) {
      throw new BadRequestException(
        "Password must be at least 6 characters.",
      );
    }
    const pending = await this.pendingRegistrationModel
      .findOne({ codeHash: this.hashToken(token) })
      .exec();

    if (!pending || pending.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        "This confirmation link is invalid or has expired. Please sign up again.",
      );
    }

    // Guard against a race / double-click where the account already exists.
    const existing = await this.usersService.findByEmail(pending.email);
    if (existing) {
      await this.pendingRegistrationModel.deleteOne({ _id: pending._id });
      throw new ConflictException(
        "An account with this email already exists. Please log in instead.",
      );
    }

    const fullDto: RegisterCompanyWithAdminDto = {
      name: pending.companyName,
      address: "—",
      email: pending.email,
      adminName: pending.userName || pending.companyName,
      adminEmail: pending.email,
      adminPassword: password,
    };

    const { company, admin } =
      await this.companyService.registerCompanyWithAdmin(fullDto);

    const companyId =
      (company as { _id?: { toString(): string } })?._id?.toString?.() ??
      admin.companyId;
    try {
      await this.companyService.startTrialForCompany(companyId, {
        days: AuthService.TRIAL_DAYS,
        maxUsers: AuthService.TRIAL_MAX_USERS,
      });
    } catch (error) {
      this.logger.error(
        `Failed to start trial for company ${companyId}: ${String(error)}`,
      );
    }

    await this.pendingRegistrationModel.deleteOne({ _id: pending._id });

    const adminId = admin._id ? admin._id.toString() : admin.id;

    // Welcome email pointing to the web admin panel. They sign in there (and in
    // the app) with the email + password they chose — no magic code needed, so
    // it can't clash with the app's sign-in code below.
    try {
      await this.mailService.sendCompanyWelcomeEmail({
        email: pending.email,
        name: admin.name,
        companyName: pending.companyName,
        trialDays: AuthService.TRIAL_DAYS,
        maxUsers: AuthService.TRIAL_MAX_USERS,
      });
    } catch (error) {
      this.logger.error(`Failed to send welcome email: ${String(error)}`);
    }

    // Single-use magic code the app consumes via the deep link to sign in.
    const magicLoginCode =
      await this.usersService.createMagicLoginCode(adminId);

    return { magicLoginCode };
  }

  // Re-issue a fresh confirmation link for a still-pending sign-up. Always
  // resolves so we never reveal whether a pending registration exists.
  async resendRegistrationLink(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    this.assertRegisterAllowed(normalizedEmail);
    const pending = await this.pendingRegistrationModel
      .findOne({ email: normalizedEmail })
      .select("+codeHash")
      .exec();
    if (!pending) {
      return;
    }
    const plainToken = randomBytes(32).toString("hex");
    pending.codeHash = createHash("sha256").update(plainToken).digest("hex");
    pending.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    pending.attempts = 0;
    await pending.save();
    try {
      await this.mailService.sendCompanyVerificationEmail(
        normalizedEmail,
        pending.userName,
        plainToken,
      );
    } catch (error) {
      this.logger.error(`Failed to resend verification email: ${String(error)}`);
    }
  }

  // Email an existing active account a fresh 6-digit sign-in code (app
  // re-login). Always resolves — we never reveal whether the email exists.
  async requestLoginCode(email: string): Promise<void> {
    const result = await this.usersService.issueShortLoginCodeForEmail(email);
    if (result) {
      try {
        await this.mailService.sendLoginCodeEmail(
          result.user.email,
          result.user.name,
          result.code,
          languageCode(result.user.language),
        );
      } catch (error) {
        this.logger.error(`Failed to send login code: ${String(error)}`);
      }
    }
  }

  // Exchange an emailed 6-digit code for a session (mobile app sign-in).
  async codeLogin(email: string, code: string) {
    const user = await this.usersService.consumeShortLoginCode(email, code);
    return this.generateTokens(user);
  }

  // Consume a (long) magic code and build the web admin-panel callback URL with
  // freshly minted tokens in the hash, so the emailed admin link is one-click.
  async webMagicRedirectUrl(code: string): Promise<string> {
    const tokens = await this.magicLogin(code);
    const adminUrl = (
      this.configService.get<string>("ADMIN_APP_URL") ||
      this.configService.get<string>("WEB_APP_URL") ||
      "https://admin.byggexp.se"
    ).replace(/\/$/, "");
    const params = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: JSON.stringify(tokens.user),
    });
    return `${adminUrl}/auth/callback#${params.toString()}`;
  }

  // "Forgot password" step 1: email a reset link. Always resolves (and never
  // reveals whether the email is registered) so it can't be used to probe for
  // accounts. Rate-limited per email like sign-up.
  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email?.trim().toLowerCase() || "";
    if (!normalizedEmail) {
      return;
    }
    this.assertRegisterAllowed(`reset:${normalizedEmail}`);
    const result =
      await this.usersService.issuePasswordResetForEmail(normalizedEmail);
    if (result) {
      try {
        await this.mailService.sendPasswordResetEmail(
          result.user.email,
          result.user.name,
          result.token,
          languageCode(result.user.language),
        );
      } catch (error) {
        this.logger.error(`Failed to send password reset: ${String(error)}`);
      }
    }
  }

  // Validate a reset token so the controller can show the "choose a new
  // password" page. Throws if it's invalid or expired.
  async assertPasswordResetTokenValid(token: string): Promise<void> {
    const count = await this.usersService.countPasswordResetToken(token);
    if (count < 1) {
      throw new BadRequestException(
        "This password reset link is invalid or has expired. Please request a new one.",
      );
    }
  }

  // "Forgot password" step 2: the user submitted a new password on the reset
  // page. Hash it and apply it to every account the token unlocks.
  async resetPassword(
    token: string,
    password: string,
  ): Promise<string | null> {
    if (!password || password.length < 6) {
      throw new BadRequestException(
        "Password must be at least 6 characters long.",
      );
    }
    const hashedPassword = await this.hashPassword(password);
    const { count, role } = await this.usersService.applyPasswordReset(
      token,
      hashedPassword,
    );
    if (count < 1) {
      throw new BadRequestException(
        "This password reset link is invalid or has expired. Please request a new one.",
      );
    }
    return role;
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
