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

// A page that deep-links into the app to finish sign-in with a magic code.
// Shared by verify-email (worker invites) and register-company/confirm.
function magicRedirectHtml(magicLoginCode: string, message: string): string {
  const encodedCode = encodeURIComponent(magicLoginCode);
  const magicUrl = `byggexp://auth/magic?code=${encodedCode}`;
  const androidIntentUrl = `intent://auth/magic?code=${encodedCode}#Intent;scheme=byggexp;package=com.anonymous.totbygghubmobileapp;end`;
  return `<!DOCTYPE html>
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
      <p>${message}</p>
      <a class="button" href="${magicUrl}">Open ByggExp</a>
      <a class="button" href="${androidIntentUrl}">Open on Android</a>
      <p class="hint">If the app does not open, install ByggExp and tap the button again, then sign in with your email and password.</p>
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
</html>`;
}

function errorHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f5f7fa; color: #052d50; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { background: #fff; border-radius: 16px; padding: 32px; max-width: 420px; box-shadow: 0 8px 24px rgba(5, 45, 80, 0.08); text-align: center; }
      h1 { font-size: 24px; margin: 0 0 12px; }
      p { margin: 0; line-height: 1.5; color: #5a6b7d; }
    </style>
  </head>
  <body>
    <div class="card"><h1>${title}</h1><p>${message}</p></div>
  </body>
</html>`;
}

// Step-2 page: after clicking the confirmation link, the user chooses a
// password here. Posts back to /auth/register-company/set-password.
function passwordFormHtml(token: string, error?: string): string {
  const safeToken = token.replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Choose your password</title>
    <style>
      body { font-family: Arial, sans-serif; background: #eef4fb; color: #052d50; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
      .card { background: #fff; border-radius: 16px; padding: 28px; max-width: 380px; width: 100%; box-shadow: 0 8px 24px rgba(5,45,80,.08); }
      h1 { font-size: 22px; margin: 0 0 6px; }
      p { margin: 0 0 18px; color: #5a6b7d; font-size: 14px; line-height: 1.4; }
      label { display: block; font-size: 12px; color: #052d50; margin: 12px 0 6px; }
      input { width: 100%; box-sizing: border-box; height: 46px; padding: 0 14px; border: 1px solid #e0e7ee; border-radius: 12px; font-size: 15px; }
      button { width: 100%; height: 48px; margin-top: 20px; border: 0; border-radius: 24px; background: #3183ff; color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; }
      .err { color: #c62828; font-size: 13px; margin-bottom: 12px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Choose your password</h1>
      <p>Set a password to finish creating your ByggExp account. You'll sign in with your email and this password.</p>
      ${error ? `<div class="err">${error}</div>` : ""}
      <form method="POST" action="/auth/register-company/set-password" onsubmit="return checkForm()">
        <input type="hidden" name="token" value="${safeToken}" />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" minlength="6" required placeholder="At least 6 characters" />
        <label for="confirm">Confirm password</label>
        <input id="confirm" name="confirm" type="password" minlength="6" required placeholder="Repeat your password" />
        <button type="submit">Create account</button>
      </form>
    </div>
    <script>
      function checkForm() {
        var p = document.getElementById('password').value;
        var c = document.getElementById('confirm').value;
        if (p.length < 6) { alert('Password must be at least 6 characters.'); return false; }
        if (p !== c) { alert("Passwords don't match."); return false; }
        return true;
      }
    </script>
  </body>
</html>`;
}

@Public()
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("register")
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  // Step 1: validate + email a confirmation link (no company created yet).
  @Post("register-company")
  registerCompany(@Body() dto: RegisterCompanyPublicDto) {
    return this.authService.registerCompany(dto);
  }

  // Step 2a: the user clicks the emailed link. Show the "choose a password"
  // page (the account is created when they submit it).
  @Get("register-company/confirm")
  async confirmRegistration(@Query("token") token: string, @Res() res: Response) {
    if (!token?.trim()) {
      throw new BadRequestException("Confirmation token is required");
    }
    try {
      await this.authService.getPendingByToken(token.trim());
      res.status(200).type("html").send(passwordFormHtml(token.trim()));
    } catch (error) {
      const message =
        error instanceof BadRequestException
          ? error.message
          : "This confirmation link is invalid or has expired. Please sign up again.";
      res.status(400).type("html").send(errorHtml("Confirmation failed", message));
    }
  }

  // Step 2b: the password form posts here. Create the account, then deep-link
  // into the app to sign them in automatically.
  @Post("register-company/set-password")
  async setRegistrationPassword(
    @Body() body: { token?: string; password?: string },
    @Res() res: Response,
  ) {
    const token = (body?.token || "").trim();
    const password = body?.password || "";
    if (!token) {
      res
        .status(400)
        .type("html")
        .send(errorHtml("Something went wrong", "Missing confirmation token."));
      return;
    }
    try {
      const { magicLoginCode } = await this.authService.completeRegistration(
        token,
        password,
      );
      res
        .status(200)
        .type("html")
        .send(
          magicRedirectHtml(
            magicLoginCode,
            "Your account is ready. Opening ByggExp to sign you in…",
          ),
        );
    } catch (error) {
      const message =
        error instanceof BadRequestException
          ? error.message
          : "Unable to create your account. Please try again.";
      // Re-show the form with the error so they can retry.
      res.status(400).type("html").send(passwordFormHtml(token, message));
    }
  }

  // Re-send the confirmation link for a pending sign-up. Always 200.
  @Post("register-company/resend")
  async resendRegistration(@Body("email") email: string) {
    if (!email?.trim()) {
      throw new BadRequestException("Email is required");
    }
    await this.authService.resendRegistrationLink(email.trim());
    return { success: true };
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
      res
        .status(200)
        .type("html")
        .send(magicRedirectHtml(result.magicLoginCode, result.message));
    } catch (error) {
      const message =
        error instanceof BadRequestException
          ? error.message
          : "Unable to verify email.";
      res
        .status(400)
        .type("html")
        .send(errorHtml("Verification failed", message));
    }
  }
}
