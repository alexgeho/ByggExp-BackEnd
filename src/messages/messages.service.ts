import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chat, ChatDocument } from '../chats/schemas/chat.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { SendMessageDto } from './dto/send-message.dto';
import { Message, MessageDocument } from './schemas/message.schema';

type AuthenticatedUser = {
  userId: string;
  role: UserRole;
};

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectModel(Message.name) private readonly messageModel: Model<MessageDocument>,
    @InjectModel(Chat.name) private readonly chatModel: Model<ChatDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findByChat(chatId: string, user: AuthenticatedUser) {
    await this.findAccessibleChat(chatId, user);

    const messages = await this.messageModel
      .find({ chatId })
      .sort({ timestamp: 1, createdAt: 1 })
      .lean()
      .exec();

    return this.formatMessages(messages);
  }

  async send(chatId: string, sendMessageDto: SendMessageDto, user: AuthenticatedUser) {
    const chat = await this.findAccessibleChat(chatId, user);
    const text = sendMessageDto.text?.trim();

    if (!text) {
      throw new BadRequestException('Message text is required');
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
    const readStateIndex = nextReadStates.findIndex((entry) => entry.memberId === user.userId);

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

    const [formattedMessage] = await this.formatMessages([createdMessage.toObject()]);
    await this.sendMessageNotification(chatDocument, formattedMessage, user.userId);
    return formattedMessage;
  }

  private async findAccessibleChat(chatId: string, user: AuthenticatedUser) {
    const chat = await this.chatModel.findById(chatId).lean().exec();

    if (!chat) {
      throw new NotFoundException(`Chat with ID "${chatId}" not found`);
    }

    if (!Array.isArray(chat.members) || !chat.members.includes(user.userId)) {
      throw new ForbiddenException('You do not have access to this chat');
    }

    return chat;
  }

  private async formatMessages(messages: any[]) {
    const userIds = [...new Set(messages.map((message) => message.userId?.toString()).filter(Boolean))];
    const users = userIds.length
      ? await this.userModel
        .find({ _id: { $in: userIds } })
        .select('_id name email')
        .lean()
        .exec()
      : [];
    const usersById = new Map(users.map((user: any) => [user._id.toString(), user]));

    return messages.map((message) => {
      const sender = usersById.get(message.userId?.toString());

      return {
        _id: message._id.toString(),
        chatId: message.chatId.toString(),
        userId: message.userId.toString(),
        text: message.text,
        timestamp: message.timestamp,
        senderName: sender?.name || sender?.email || 'Unknown user',
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
    const recipients = (chat.members || []).filter((memberId) => memberId !== actorUserId);
    if (!recipients.length) {
      return;
    }

    const title = chat.title?.trim() || message.senderName || 'New message';
    const body = chat.type === 'group'
      ? `${message.senderName}: ${this.trimMessagePreview(message.text)}`
      : this.trimMessagePreview(message.text);

    try {
      await this.notificationsService.sendToUsers(recipients, {
        title,
        body,
        preferenceKey: 'messages',
        data: {
          type: 'chat_message',
          screen: 'Chats',
          entityId: message._id,
          chatId: chat._id.toString(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send chat notification for chat ${chat._id.toString()}`, error);
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