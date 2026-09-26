import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import type { Response } from "express";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { escapeHtml } from "../newsletters/newsletter-render";
import { UserRole } from "../users/schemas/user.schema";
import { MailerCampaignsService } from "./mailer-campaigns.service";
import { ImportRow, MailerListsService } from "./mailer-lists.service";
import {
  MailerSettingsInput,
  MailerSettingsService,
} from "./mailer-settings.service";
import { SubscriberStatus } from "./schemas/mailer.schemas";

class ListDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

class ImportDto {
  @IsArray() rows: ImportRow[];
}

class TestDto {
  @IsOptional() @IsEmail() to?: string;
}

class IdsDto {
  @IsArray() ids: string[];
}

// Free-form bodies below are validated/normalised in the services.
type AnyBody = Record<string, unknown>;

@Controller("mailer")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.SuperAdmin)
export class MailerController {
  constructor(
    private readonly lists: MailerListsService,
    private readonly campaigns: MailerCampaignsService,
    private readonly settings: MailerSettingsService,
  ) {}

  // ---------- lists ----------
  @Get("lists") getLists() {
    return this.lists.listLists();
  }
  @Post("lists") createList(@Body() dto: ListDto) {
    return this.lists.createList(dto.name || "", dto.description);
  }
  @Put("lists/:id") updateList(@Param("id") id: string, @Body() dto: ListDto) {
    return this.lists.updateList(id, dto);
  }
  @Delete("lists/:id") deleteList(@Param("id") id: string) {
    return this.lists.deleteList(id);
  }
  @Post("lists/:id/import") importRows(
    @Param("id") id: string,
    @Body() dto: ImportDto,
  ) {
    return this.lists.importRows(id, dto.rows);
  }
  @Post("lists/:id/verify") verify(@Param("id") id: string) {
    return this.lists.verifyList(id);
  }

  // ---------- subscribers ----------
  @Get("subscribers")
  getSubscribers(
    @Query("listId") listId?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.lists.listSubscribers({
      listId,
      status,
      search,
      page: Number(page),
      limit: Number(limit),
    });
  }
  @Post("subscribers") addSubscriber(@Body() body: AnyBody) {
    if (typeof body.listId !== "string")
      throw new BadRequestException("Välj lista");
    return this.lists.addSubscriber(body.listId, body);
  }
  @Put("subscribers/:id") updateSubscriber(
    @Param("id") id: string,
    @Body() body: AnyBody,
  ) {
    return this.lists.updateSubscriber(id, {
      name: body.name as string | undefined,
      company: body.company as string | undefined,
      city: body.city as string | undefined,
      status: body.status as SubscriberStatus | undefined,
    });
  }
  @Post("subscribers/delete") deleteSubscribers(@Body() dto: IdsDto) {
    return this.lists.deleteSubscribers(dto.ids);
  }

  // ---------- campaigns ----------
  @Get("campaigns") getCampaigns(@Query("status") status?: string) {
    return this.campaigns.list(status);
  }
  @Get("campaigns/counts") getCounts() {
    return this.campaigns.counts();
  }
  @Post("campaigns") createCampaign(@Body() body: AnyBody) {
    return this.campaigns.create(body);
  }
  @Get("campaigns/:id") getCampaign(@Param("id") id: string) {
    return this.campaigns.get(id);
  }
  @Put("campaigns/:id") updateCampaign(
    @Param("id") id: string,
    @Body() body: AnyBody,
  ) {
    return this.campaigns.update(id, body);
  }
  @Delete("campaigns/:id") deleteCampaign(@Param("id") id: string) {
    return this.campaigns.remove(id);
  }
  @Post("campaigns/:id/duplicate") duplicateCampaign(@Param("id") id: string) {
    return this.campaigns.duplicate(id);
  }
  @Post("campaigns/:id/start") start(
    @Param("id") id: string,
    @Body() body: AnyBody,
  ) {
    return this.campaigns.start(id, (body.scheduledAt as string) || null);
  }
  @Post("campaigns/:id/pause") pause(@Param("id") id: string) {
    return this.campaigns.pause(id);
  }
  @Post("campaigns/:id/resume") resume(@Param("id") id: string) {
    return this.campaigns.resume(id);
  }
  @Post("campaigns/:id/cancel") cancel(@Param("id") id: string) {
    return this.campaigns.cancel(id);
  }
  @Post("campaigns/:id/test")
  async testCampaign(
    @Param("id") id: string,
    @Body() dto: TestDto,
    @Request() req: { user?: { email?: string } },
  ) {
    const to = (dto.to || req.user?.email || "").trim();
    if (!to) throw new BadRequestException("Ingen mottagare");
    try {
      return await this.campaigns.sendTest(id, to);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        `Kunde inte skicka: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---------- log ----------
  @Get("events")
  getEvents(
    @Query("campaignId") campaignId?: string,
    @Query("type") type?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.campaigns.listEvents({
      campaignId,
      type,
      search,
      page: Number(page),
      limit: Number(limit),
    });
  }

  // ---------- settings ----------
  @Get("settings") getSettings() {
    return this.settings.getPublic();
  }
  @Put("settings") updateSettings(@Body() body: AnyBody) {
    return this.settings.update(body as MailerSettingsInput);
  }
  @Post("settings/verify") async verifySmtp() {
    await this.settings.verifyConnection();
    return { ok: true };
  }
}

// ---------- public tracking / unsubscribe ----------

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const page = (title: string, body: string) => `<!DOCTYPE html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{margin:0;font-family:Helvetica,Arial,sans-serif;background:#f4f6fa;color:#0f2350}
.box{max-width:460px;margin:12vh auto;background:#fff;border-radius:14px;padding:36px 32px;text-align:center;box-shadow:0 2px 10px rgba(15,35,80,.08)}
h1{font-size:22px;margin:0 0 12px}p{font-size:15px;line-height:22px;color:#475569}
button{margin-top:18px;background:#1c6cf3;color:#fff;border:0;border-radius:24px;padding:13px 28px;font-size:15px;font-weight:bold;cursor:pointer}</style>
</head><body><div class="box">${body}</div></body></html>`;

@Controller("m")
@Public()
export class MailerPublicController {
  constructor(private readonly campaigns: MailerCampaignsService) {}

  @Get("o/:file")
  async open(@Param("file") file: string, @Res() res: Response) {
    const token = file.replace(/\.gif$/, "");
    this.campaigns.trackOpen(token).catch(() => undefined);
    res.set({
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, max-age=0",
    });
    res.send(PIXEL);
  }

  @Get("c/:token")
  async click(
    @Param("token") token: string,
    @Query("u") url: string,
    @Query("s") sig: string,
    @Res() res: Response,
  ) {
    const dest = await this.campaigns
      .trackClick(token, String(url || ""), String(sig || ""))
      .catch(() => null);
    if (!dest)
      return res
        .status(400)
        .send(page("Ogiltig länk", "<h1>Ogiltig länk</h1>"));
    return res.redirect(302, dest);
  }

  // GET only asks for confirmation: link scanners in mail gateways open every
  // URL, and must not unsubscribe people by accident.
  @Get("u/:token")
  confirm(@Param("token") token: string, @Res() res: Response) {
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(
      page(
        "Avregistrera",
        `<h1>Avregistrera dig</h1><p>Vill du sluta få våra nyhetsbrev?</p>
<form method="post" action="${escapeHtml(token)}"><button type="submit">Ja, avregistrera mig</button></form>`,
      ),
    );
  }

  // Form submit and RFC 8058 one-click POST from Gmail/Outlook land here.
  @Post("u/:token")
  async unsubscribe(@Param("token") token: string, @Res() res: Response) {
    const r = await this.campaigns
      .unsubscribe(token)
      .catch(() => ({ ok: false }));
    res.set("Content-Type", "text/html; charset=utf-8");
    res
      .status(r.ok ? 200 : 404)
      .send(
        r.ok
          ? page(
              "Avregistrerad",
              "<h1>Du är avregistrerad</h1><p>Du kommer inte att få fler nyhetsbrev från oss.</p>",
            )
          : page(
              "Ogiltig länk",
              "<h1>Länken är ogiltig</h1><p>Kontakta oss om du vill avregistrera dig.</p>",
            ),
      );
  }
}
