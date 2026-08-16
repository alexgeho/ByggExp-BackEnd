import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Chat, ChatDocument } from "../chats/schemas/chat.schema";
import { NotificationsService } from "../notifications/notifications.service";
import { TranslationService } from "../translation/translation.service";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { SendMessageDto } from "./dto/send-message.dto";
import { Message, MessageDocument } from "./schemas/message.schema";
import { ModerationService } from "../moderation/moderation.service";

type AuthenticatedUser = {
  userId: string;
  role: UserRole;
};

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(Chat.name) private readonly chatModel: Model<ChatDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly translationService: TranslationService,
    private readonly moderationService: ModerationService,
  ) {}

  // Block guard for one-to-one chats: if either participant has blocked the
  // other, the message is refused. Group chats are left unaffected (a single
  // block shouldn't silence someone for the whole team).
  private async assertNotBlocked(
    chat: { type?: string; members?: string[] },
    senderId: string,
  ): Promise<void> {
    if (chat.type === "group") {
      return;
    }
    const others = (chat.members || []).filter((id) => id !== senderId);
    for (const otherId of others) {
      if (await this.moderationService.isBlockedBetween(senderId, otherId)) {
        throw new ForbiddenException(
          "You can no longer send messages in this conversation.",
        );
      }
    }
  }

  async findByChat(chatId: string, user: AuthenticatedUser, lang?: string) {
    await this.findAccessibleChat(chatId, user);

    const messages = await this.messageModel
      .find({ chatId })
      .sort({ timestamp: 1, createdAt: 1 })
      .lean()
      .exec();

    const targetLang = (lang || "").trim().toUpperCase();
    if (targetLang && this.translationService.enabled) {
      await this.ensureTranslations(messages, targetLang);
    }

    return this.formatMessages(messages, targetLang);
  }

  // Translate any messages not yet available in the target language and cache
  // the result on each message so the provider is called at most once per
  // (message, language).
  private async ensureTranslations(messages: any[], targetLang: string) {
    const pending = messages.filter(
      (m) =>
        m.text &&
        (m.sourceLang || "").toUpperCase() !== targetLang &&
        !(m.translations && m.translations[targetLang]),
    );
    if (!pending.length) return;

    const results = await this.translationService.translateBatch(
      pending.map((m) => m.text),
      targetLang,
    );

    const ops: any[] = [];
    results.forEach((r, i) => {
      if (!r.translated) return;
      const m = pending[i];
      const src = (r.detectedSourceLang || "").toUpperCase();
      m.translations = { ...(m.translations || {}), [targetLang]: r.text };
      const set: Record<string, string> = {
        [`translations.${targetLang}`]: r.text,
      };
      if (src && !m.sourceLang) {
        m.sourceLang = src;
        set.sourceLang = src;
      }
      ops.push({
        updateOne: { filter: { _id: m._id }, update: { $set: set } },
      });
    });

    if (ops.length) {
      await this.messageModel.bulkWrite(ops);
    }
  }

  async send(
    chatId: string,
    sendMessageDto: SendMessageDto,
    user: AuthenticatedUser,
  ) {
    const chat = await this.findAccessibleChat(chatId, user);
    await this.assertNotBlocked(chat, user.userId);
    const text = sendMessageDto.text?.trim();

    if (!text) {
      throw new BadRequestException("Message text is required");
    }

    const createdMessage = await this.messageModel.create({
      chatId,
      userId: user.userId,
      text,
      timestamp: new Date(),
    });

    const chatDocument = await this.chatModel.findById(chat._id).exec();

    if (!chatDocument) {
      throw new NotFoundException(`Chat with ID "${chatId}" not found`);
    }

    const nextReadStates = Array.isArray(chatDocument.readStates)
      ? [...chatDocument.readStates]
      : [];
    const readStateIndex = nextReadStates.findIndex(
      (entry) => entry.memberId === user.userId,
    );

    if (readStateIndex >= 0) {
      nextReadStates[readStateIndex] = {
        ...nextReadStates[readStateIndex],
        memberId: user.userId,
        lastReadAt: createdMessage.timestamp,
      };
    } else {
      nextReadStates.push({
        memberId: user.userId,
        lastReadAt: createdMessage.timestamp,
      });
    }

    chatDocument.lastMessageText = text;
    chatDocument.lastMessageAt = createdMessage.timestamp;
    chatDocument.readStates = nextReadStates;
    await chatDocument.save();

    const [formattedMessage] = await this.formatMessages([
      createdMessage.toObject(),
    ]);
    await this.sendMessageNotification(
      chatDocument,
      formattedMessage,
      user.userId,
    );
    return formattedMessage;
  }

  async sendWithAttachments(
    chatId: string,
    files: Array<{
      originalname: string;
      filename: string;
      mimetype: string;
    }>,
    rawText: string,
    user: AuthenticatedUser,
  ) {
    const chat = await this.findAccessibleChat(chatId, user);
    await this.assertNotBlocked(chat, user.userId);
    const text = (rawText || "").trim();
    const attachments = (files || []).map((file) => ({
      url: `/uploads/chat-attachments/${file.filename}`,
      name: file.originalname,
      mimeType: file.mimetype,
      kind: file.mimetype?.startsWith("image/") ? "image" : "file",
    }));

    if (!text && attachments.length === 0) {
      throw new BadRequestException("Message text or attachment is required");
    }

    const createdMessage = await this.messageModel.create({
      chatId,
      userId: user.userId,
      text,
      attachments,
      timestamp: new Date(),
    });

    const chatDocument = await this.chatModel.findById(chat._id).exec();
    if (!chatDocument) {
      throw new NotFoundException(`Chat with ID "${chatId}" not found`);
    }

    const nextReadStates = Array.isArray(chatDocument.readStates)
      ? [...chatDocument.readStates]
      : [];
    const readStateIndex = nextReadStates.findIndex(
      (entry) => entry.memberId === user.userId,
    );
    if (readStateIndex >= 0) {
      nextReadStates[readStateIndex] = {
        ...nextReadStates[readStateIndex],
        memberId: user.userId,
        lastReadAt: createdMessage.timestamp,
      };
    } else {
      nextReadStates.push({
        memberId: user.userId,
        lastReadAt: createdMessage.timestamp,
      });
    }

    const preview =
      text ||
      (attachments.some((a) => a.kind === "image") ? "📷 Photo" : "📎 File");
    chatDocument.lastMessageText = preview;
    chatDocument.lastMessageAt = createdMessage.timestamp;
    chatDocument.readStates = nextReadStates;
    await chatDocument.save();

    const [formattedMessage] = await this.formatMessages([
      createdMessage.toObject(),
    ]);
    await this.sendMessageNotification(
      chatDocument,
      formattedMessage,
      user.userId,
    );
    return formattedMessage;
  }

  private async findAccessibleChat(chatId: string, user: AuthenticatedUser) {
    const chat = await this.chatModel.findById(chatId).lean().exec();

    if (!chat) {
      throw new NotFoundException(`Chat with ID "${chatId}" not found`);
    }

    if (!Array.isArray(chat.members) || !chat.members.includes(user.userId)) {
      throw new ForbiddenException("You do not have access to this chat");
    }

    return chat;
  }

  private async formatMessages(messages: any[], targetLang = "") {
    const userIds = [
      ...new Set(
        messages.map((message) => message.userId?.toString()).filter(Boolean),
      ),
    ];
    const users = userIds.length
      ? await this.userModel
          .find({ _id: { $in: userIds } })
          .select("_id name email")
          .lean()
          .exec()
      : [];
    const usersById = new Map(
      users.map((user: any) => [user._id.toString(), user]),
    );

    return messages.map((message) => {
      const sender = usersById.get(message.userId?.toString());
      const sourceLang = message.sourceLang || "";
      const cached = targetLang ? message.translations?.[targetLang] : null;
      // Only surface a translation when the message isn't already in the
      // reader's language.
      const translatedText =
        targetLang && cached && sourceLang.toUpperCase() !== targetLang
          ? cached
          : null;

      return {
        _id: message._id.toString(),
        chatId: message.chatId.toString(),
        userId: message.userId.toString(),
        text: message.text,
        translatedText,
        sourceLang,
        attachments: Array.isArray(message.attachments)
          ? message.attachments
          : [],
        timestamp: message.timestamp,
        senderName: sender?.name || sender?.email || "Unknown user",
      };
    });
  }

  private async sendMessageNotification(
    chat: ChatDocument,
    message: {
      _id: string;
      senderName: string;
      text: string;
    },
    actorUserId: string,
  ) {
    const recipients = (chat.members || []).filter(
      (memberId) => memberId !== actorUserId,
    );
    if (!recipients.length) {
      return;
    }

    const title = chat.title?.trim() || message.senderName || "New message";
    const body =
      chat.type === "group"
        ? `${message.senderName}: ${this.trimMessagePreview(message.text)}`
        : this.trimMessagePreview(message.text);

    try {
      await this.notificationsService.sendToUsers(recipients, {
        title,
        body,
        preferenceKey: "messages",
        data: {
          type: "chat_message",
          screen: "Chats",
          entityId: message._id,
          chatId: chat._id.toString(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send chat notification for chat ${chat._id.toString()}`,
        error,
      );
    }
  }

  private trimMessagePreview(text: string) {
    const normalizedText = text.trim();
    if (normalizedText.length <= 120) {
      return normalizedText;
    }

    return `${normalizedText.slice(0, 117)}...`;
  }
}
