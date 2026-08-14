import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Res,
  BadRequestException,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { CreateUserDto } from "../users/dto/create-user.dto";
import { RegisterCompanyPublicDto } from "./dto/register-company-public.dto";
import { Public } from "../common/decorators/public.decorator";

@Public()
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("register")
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post("register-company")
  registerCompany(@Body() dto: RegisterCompanyPublicDto) {
    return this.authService.registerCompany(dto);
  }

  @Post("register-superadmin")
  registerSuperAdmin(@Body() createUserDto: CreateUserDto) {
    return this.authService.registerSuperAdmin(createUserDto);
  }

  @Post("login")
  async login(@Body() loginDto: { email: string; password: string }) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @Post("refresh")
  refresh(@Body("refresh_token") refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @Post("magic-login")
  async magicLogin(@Body("code") code: string) {
    if (!code?.trim()) {
      throw new BadRequestException("Sign-in code is required");
    }

    return this.authService.magicLogin(code.trim());
  }

  // Email a fresh 6-digit sign-in code to an existing account (app re-login).
  // Always 200 so we don't reveal whether the email is registered.
  @Post("request-code")
  async requestCode(@Body("email") email: string) {
    if (!email?.trim()) {
      throw new BadRequestException("Email is required");
    }
    await this.authService.requestLoginCode(email.trim());
    return { success: true };
  }

  // Exchange the emailed 6-digit code for a session (mobile app sign-in).
  @Post("code-login")
  async codeLogin(@Body() body: { email: string; code: string }) {
    if (!body?.email?.trim() || !body?.code?.trim()) {
      throw new BadRequestException("Email and code are required");
    }
    return this.authService.codeLogin(body.email.trim(), body.code.trim());
  }

  // One-click admin-panel sign-in from the welcome email: consume the magic
  // code, mint tokens, and redirect into the web admin's /auth/callback.
  @Get("web-magic")
  async webMagic(@Query("code") code: string, @Res() res: Response) {
    if (!code?.trim()) {
      throw new BadRequestException("Sign-in code is required");
    }
    try {
      const url = await this.authService.webMagicRedirectUrl(code.trim());
      res.redirect(302, url);
    } catch (error) {
      const message =
        error instanceof BadRequestException
          ? error.message
          : "This sign-in link is invalid or expired.";
      res.status(400).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><title>Sign-in failed</title>
<style>body{font-family:Arial,sans-serif;background:#f5f7fa;color:#052d50;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#fff;border-radius:16px;padding:32px;max-width:420px;text-align:center;box-shadow:0 8px 24px rgba(5,45,80,.08)}</style>
</head><body><div class="card"><h1>Sign-in failed</h1><p>${message}</p></div></body></html>`);
    }
  }

  @Get("verify-email")
  async verifyEmail(@Query("token") token: string, @Res() res: Response) {
    if (!token?.trim()) {
      throw new BadRequestException("Verification token is required");
    }

    try {
      const result = await this.authService.verifyEmail(token.trim());
      const encodedCode = encodeURIComponent(result.magicLoginCode);
      const magicUrl = `byggexp://auth/magic?code=${encodedCode}`;
      const androidIntentUrl = `intent://auth/magic?code=${encodedCode}#Intent;scheme=byggexp;package=com.anonymous.totbygghubmobileapp;end`;

      res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="refresh" content="0;url=${magicUrl}" />
    <title>Email confirmed</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f5f7fa; color: #052d50; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
      .card { background: #fff; border-radius: 16px; padding: 32px; max-width: 420px; box-shadow: 0 8px 24px rgba(5, 45, 80, 0.08); text-align: center; }
      h1 { font-size: 24px; margin: 0 0 12px; }
      p { margin: 0 0 16px; line-height: 1.5; color: #5a6b7d; }
      a.button { display: inline-block; background: #0785f4; color: #fff; text-decoration: none; padding: 14px 20px; border-radius: 999px; font-weight: 600; margin: 4px; }
      .hint { font-size: 14px; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Email confirmed</h1>
      <p>${result.message}</p>
      <a class="button" href="${magicUrl}">Open ByggExp</a>
      <a class="button" href="${androidIntentUrl}">Open on Android</a>
      <p class="hint">If the app does not open, install ByggExp and tap the button again. You can also sign in with your email and temporary password.</p>
    </div>
    <script>
      (function () {
        var magicUrl = ${JSON.stringify(magicUrl)};
        var androidIntentUrl = ${JSON.stringify(androidIntentUrl)};
        var isAndroid = /Android/i.test(navigator.userAgent || '');
        window.location.href = isAndroid ? androidIntentUrl : magicUrl;
        window.setTimeout(function () {
          window.location.href = magicUrl;
        }, 400);
      })();
    </script>
  </body>
</html>`);
    } catch (error) {
      const message =
        error instanceof BadRequestException
          ? error.message
          : "Unable to verify email.";

      res.status(400).type("html").send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verification failed</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f5f7fa; color: #052d50; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { background: #fff; border-radius: 16px; padding: 32px; max-width: 420px; box-shadow: 0 8px 24px rgba(5, 45, 80, 0.08); text-align: center; }
      h1 { font-size: 24px; margin: 0 0 12px; }
      p { margin: 0; line-height: 1.5; color: #5a6b7d; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Verification failed</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`);
    }
  }
}
