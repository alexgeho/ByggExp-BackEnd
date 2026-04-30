import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Chat, ChatDocument } from '../chats/schemas/chat.schema';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { SendMessageDto } from './dto/send-message.dto';
import { Message, MessageDocument } from './schemas/message.schema';

type AuthenticatedUser = {
  userId: string;
  role: UserRole;
};

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private readonly messageModel: Model<MessageDocument>,
    @InjectModel(Chat.name) private readonly chatModel: Model<ChatDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
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

    await this.chatModel.findByIdAndUpdate(chat._id, {
      $set: {
        lastMessageText: text,
        lastMessageAt: createdMessage.timestamp,
      },
    }).exec();

    const [formattedMessage] = await this.formatMessages([createdMessage.toObject()]);
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
}