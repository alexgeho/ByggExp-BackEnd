import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { CreateDirectChatDto } from './dto/create-direct-chat.dto';
import { CreateProjectGroupChatDto } from './dto/create-project-group-chat.dto';
import { Chat, ChatDocument, ChatType } from './schemas/chat.schema';

type AuthenticatedUser = {
  userId: string;
  role: UserRole;
  companyId?: string | null;
};

@Injectable()
export class ChatsService {
  constructor(
    @InjectModel(Chat.name) private readonly chatModel: Model<ChatDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
  ) {}

  async findAccessible(user: AuthenticatedUser) {
    const chats = await this.chatModel
      .find({ members: this.normalizeId(user.userId) })
      .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
      .lean()
      .exec();

    return this.formatChats(chats, this.normalizeId(user.userId));
  }

  async findOneAccessible(chatId: string, user: AuthenticatedUser) {
    const chat = await this.findAccessibleChat(chatId, user);
    const [formattedChat] = await this.formatChats([chat], this.normalizeId(user.userId));
    return formattedChat;
  }

  async getOrCreateDirectChat(createDirectChatDto: CreateDirectChatDto, user: AuthenticatedUser) {
    const participantId = createDirectChatDto.participantId?.trim();

    if (!participantId) {
      throw new BadRequestException('Participant id is required');
    }

    if (participantId === user.userId) {
      throw new BadRequestException('Cannot create a direct chat with yourself');
    }

    const participant = await this.userModel
      .findById(participantId)
      .select('_id name email profession')
      .lean()
      .exec();

    if (!participant) {
      throw new NotFoundException(`User with ID "${participantId}" not found`);
    }

    const members = [...new Set([
      this.normalizeId(user.userId),
      this.normalizeId(participantId),
    ])].sort();
    const directKey = `direct:${members.join(':')}`;

    let chat: any = await this.chatModel.findOne({ directKey }).lean().exec();

    if (!chat) {
      const createdChat = await this.chatModel.create({
        ownerId: user.userId,
        type: ChatType.Direct,
        members,
        title: '',
        directKey,
        lastMessageText: '',
        lastMessageAt: null,
      });

      chat = createdChat.toObject() as any;
    }

    const [formattedChat] = await this.formatChats([chat], this.normalizeId(user.userId));
    return formattedChat;
  }

  async getOrCreateProjectGroupChat(
    createProjectGroupChatDto: CreateProjectGroupChatDto,
    user: AuthenticatedUser,
  ) {
    const project = await this.projectModel.findById(createProjectGroupChatDto.projectId).lean().exec();

    if (!project) {
      throw new NotFoundException(
        `Project with ID "${createProjectGroupChatDto.projectId}" not found`,
      );
    }

    this.assertCanAccessProject(project, user);

    const members = this.getProjectChatMembers(project, user.userId);
    const groupKey = `project:${project._id.toString()}`;
    const title = createProjectGroupChatDto.title?.trim() || project.name || 'Project chat';

    const existingChat = await this.chatModel.findOne({ groupKey }).exec();

    if (existingChat) {
      const nextMembers = [...new Set([...(existingChat.members || []), ...members])];
      const membersChanged = nextMembers.length !== (existingChat.members || []).length;
      const titleChanged = existingChat.title !== title;
      const projectChanged = existingChat.projectId !== project._id.toString();

      if (membersChanged || titleChanged || projectChanged) {
        existingChat.members = nextMembers;
        existingChat.title = title;
        existingChat.projectId = project._id.toString();
        await existingChat.save();
      }

      const [formattedChat] = await this.formatChats(
        [existingChat.toObject()],
        this.normalizeId(user.userId),
      );
      return formattedChat;
    }

    const createdChat = await this.chatModel.create({
      ownerId: user.userId,
      type: ChatType.Group,
      members,
      title,
      projectId: project._id.toString(),
      groupKey,
      lastMessageText: '',
      lastMessageAt: null,
    });

    const [formattedChat] = await this.formatChats(
      [createdChat.toObject()],
      this.normalizeId(user.userId),
    );
    return formattedChat;
  }

  async assertChatMembership(chatId: string, user: AuthenticatedUser) {
    return this.findAccessibleChat(chatId, user);
  }

  private async findAccessibleChat(chatId: string, user: AuthenticatedUser) {
    const chat = await this.chatModel.findById(chatId).lean().exec();

    if (!chat) {
      throw new NotFoundException(`Chat with ID "${chatId}" not found`);
    }

    const members = this.normalizeIds(chat.members);

    if (!members.includes(this.normalizeId(user.userId))) {
      throw new ForbiddenException('You do not have access to this chat');
    }

    return {
      ...chat,
      members,
    };
  }

  private assertCanAccessProject(project: any, user: AuthenticatedUser) {
    const participantIds = this.normalizeIds([
      project.ownerId,
      project.projectManagerId,
      ...(project.projectAdmins || []),
      ...(project.workers || []),
    ]);
    const normalizedUserId = this.normalizeId(user.userId);
    const normalizedCompanyId = this.normalizeId(user.companyId);
    const projectCompanyId = this.normalizeId(project.companyId);
    const isParticipant = participantIds.includes(normalizedUserId);

    const isCompanyAdminForProject = user.role === UserRole.CompanyAdmin
      && !!normalizedCompanyId
      && projectCompanyId === normalizedCompanyId;

    if (isParticipant || user.role === UserRole.SuperAdmin || isCompanyAdminForProject) {
      return;
    }

    throw new ForbiddenException('You do not have access to this project chat');
  }

  private getProjectChatMembers(project: any, actorUserId?: string) {
    return [...new Set(this.normalizeIds([
      project.ownerId,
      project.projectManagerId,
      ...(project.projectAdmins || []),
      ...(project.workers || []),
      actorUserId,
    ]))];
  }

  private async formatChats(chats: any[], currentUserId: string) {
    const directParticipantIds = chats
      .filter((chat) => chat.type === ChatType.Direct)
      .flatMap((chat) => (chat.members || []).filter((memberId) => memberId !== currentUserId));
    const projectIds = chats
      .filter((chat) => chat.type === ChatType.Group && chat.projectId)
      .map((chat) => chat.projectId);

    const [users, projects] = await Promise.all([
      directParticipantIds.length
        ? this.userModel.find({ _id: { $in: [...new Set(directParticipantIds)] } })
          .select('_id name email profession')
          .lean()
          .exec()
        : Promise.resolve([]),
      projectIds.length
        ? this.projectModel.find({ _id: { $in: [...new Set(projectIds)] } })
          .select('_id name')
          .lean()
          .exec()
        : Promise.resolve([]),
    ]);

    const usersById = new Map(users.map((user: any) => [user._id.toString(), user]));
    const projectsById = new Map(projects.map((project: any) => [project._id.toString(), project]));

    return chats.map((chat) => {
      const id = this.normalizeId(chat._id);
      const members = this.normalizeIds(chat.members);
      const projectId = this.normalizeId(chat.projectId);
      const project = projectId ? projectsById.get(projectId) : null;

      if (chat.type === ChatType.Direct) {
        const participantId = members.find((memberId) => memberId !== currentUserId) || null;
        const participant = participantId ? usersById.get(participantId) || null : null;

        return {
          _id: id,
          type: chat.type,
          title: participant?.name || participant?.email || 'Direct chat',
          members,
          memberCount: members.length,
          lastMessageText: chat.lastMessageText || '',
          lastMessageAt: chat.lastMessageAt || null,
          createdAt: chat.createdAt || null,
          updatedAt: chat.updatedAt || null,
          participant: participant
            ? {
                _id: participant._id.toString(),
                name: participant.name,
                email: participant.email,
                profession: participant.profession || '',
              }
            : null,
          project: null,
        };
      }

      return {
        _id: id,
        type: chat.type,
        title: chat.title || project?.name || 'Project chat',
        members,
        memberCount: members.length,
        lastMessageText: chat.lastMessageText || '',
        lastMessageAt: chat.lastMessageAt || null,
        createdAt: chat.createdAt || null,
        updatedAt: chat.updatedAt || null,
        participant: null,
        project: project
          ? {
                _id: this.normalizeId(project._id),
                name: project.name,
              }
          : null,
      };
    });
  }

  private normalizeId(value: any) {
    if (value === undefined || value === null) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value?.toString === 'function') {
      return value.toString();
    }

    return String(value);
  }

  private normalizeIds(values: any[]) {
    if (!Array.isArray(values)) {
      return [];
    }

    return values
      .map((value) => this.normalizeId(value))
      .filter(Boolean);
  }
}