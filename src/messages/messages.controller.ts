import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { SendMessageDto } from "./dto/send-message.dto";
import { MessagesService } from "./messages.service";
import { TranslationService } from "../translation/translation.service";

@Controller("messages")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly translationService: TranslationService,
  ) {}

  @Get("translation/status")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  translationStatus() {
    return { enabled: this.translationService.enabled };
  }

  @Get("chat/:chatId")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  findByChat(
    @Request() req,
    @Param("chatId") chatId: string,
    @Query("lang") lang?: string,
  ) {
    return this.messagesService.findByChat(chatId, req.user, lang);
  }

  @Post("chat/:chatId")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  send(
    @Request() req,
    @Param("chatId") chatId: string,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    return this.messagesService.send(chatId, sendMessageDto, req.user);
  }
}
