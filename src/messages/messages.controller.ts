import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { SendMessageDto } from "./dto/send-message.dto";
import { MessagesService } from "./messages.service";
import { TranslationService } from "../translation/translation.service";

const chatAttachmentsStorage = diskStorage({
  destination: "./uploads/chat-attachments",
  filename: (_req, file, callback) => {
    const safeBaseName =
      file.originalname
        .replace(extname(file.originalname), "")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .slice(0, 80) || "file";

    callback(null, `${Date.now()}-${safeBaseName}${extname(file.originalname)}`);
  },
});

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

  @Post("chat/:chatId/media")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  @UseInterceptors(
    FilesInterceptor("files", 10, { storage: chatAttachmentsStorage }),
  )
  sendMedia(
    @Request() req,
    @Param("chatId") chatId: string,
    @UploadedFiles()
    files: Array<{
      originalname: string;
      filename: string;
      mimetype: string;
    }>,
    @Body("text") text: string,
  ) {
    return this.messagesService.sendWithAttachments(
      chatId,
      files,
      text,
      req.user,
    );
  }
}
