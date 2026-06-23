import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserRole } from '../users/schemas/user.schema';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client, ClientDocument } from './schemas/client.schema';

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
};

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name) private clientModel: Model<ClientDocument>,
  ) {}

  async create(dto: CreateClientDto, user: AuthUser): Promise<Client> {
    const companyId = this.resolveCompanyId(dto.companyId, user);
    const customerNumber = dto.customerNumber || await this.getNextCustomerNumber(companyId);

    const client = new this.clientModel({
      ...dto,
      companyId,
      createdByUserId: user.userId,
      customerNumber,
    });

    return client.save();
  }

  async findAccessible(user: AuthUser): Promise<Client[]> {
    if (user.role === UserRole.SuperAdmin) {
      return this.clientModel.find().sort({ createdAt: -1 }).exec();
    }

    if (!user.companyId) {
      return [];
    }

    return this.clientModel
      .find({ companyId: user.companyId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, user: AuthUser): Promise<ClientDocument> {
    const client = await this.clientModel.findById(id).exec();

    if (!client) {
      throw new NotFoundException(`Client with ID "${id}" not found`);
    }

    this.assertCanAccess(client, user);
    return client;
  }

  async update(id: string, dto: UpdateClientDto, user: AuthUser): Promise<ClientDocument> {
    const client = await this.findOne(id, user);

    Object.assign(client, {
      ...dto,
      companyId: client.companyId,
      createdByUserId: client.createdByUserId,
    });

    await client.save();
    return client;
  }

  async remove(id: string, user: AuthUser): Promise<Client> {
    const client = await this.findOne(id, user);
    await this.clientModel.findByIdAndDelete(id).exec();
    return client;
  }

  async getNextCustomerNumber(companyId: string): Promise<string> {
    const clients = await this.clientModel.find({ companyId }).sort({ createdAt: -1 }).exec();

    if (!clients.length) {
      return '100';
    }

    const numbers = clients
      .map((client) => parseInt(client.customerNumber, 10))
      .filter((value) => !Number.isNaN(value));

    if (!numbers.length) {
      return '100';
    }

    return String(Math.max(...numbers) + 1);
  }

  async getNextCustomerNumberForUser(
    user: AuthUser,
    companyId?: string,
  ): Promise<{ nextNumber: string }> {
    const resolvedCompanyId = this.resolveCompanyId(companyId, user);
    const nextNumber = await this.getNextCustomerNumber(resolvedCompanyId);

    return { nextNumber };
  }

  private resolveCompanyId(companyId: string | undefined, user: AuthUser): string {
    if (user.role === UserRole.SuperAdmin) {
      if (!companyId) {
        throw new BadRequestException('companyId is required for superadmin client operations');
      }
      return companyId;
    }

    if (!user.companyId) {
      throw new ForbiddenException('Your account is not attached to a company');
    }

    return user.companyId;
  }

  private assertCanAccess(client: Client, user: AuthUser): void {
    if (user.role === UserRole.SuperAdmin) {
      return;
    }

    if (!user.companyId || String(client.companyId) !== String(user.companyId)) {
      throw new ForbiddenException('You do not have access to this client');
    }
  }
}
