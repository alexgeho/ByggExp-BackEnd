import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const createdUser = new this.userModel(createUserDto);
    return createdUser.save();
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().exec();
  }

  async findAllByCompany(companyId: string): Promise<User[]> {
    return this.userModel.find({ companyId }).exec();
  }

  async findAllByProject(projectId: string): Promise<User[]> {
    return this.userModel.find({ projectIds: projectId }).exec();
  }

  async findByIds(ids: string[]): Promise<User[]> {
    return this.userModel.find({ _id: { $in: ids } })
      .select('email name profession role companyId projectIds')
      .exec();
  }

  async findUserById(id: string): Promise<{ id: string; email: string; name: string; profession: string; role: string } | null> {
    const user = await this.userModel.findById(id).select('email name profession role').exec();
    if (!user) return null;
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      profession: user.profession || '',
      role: user.role,
    };
  }

  async findAllByRole(role: UserRole): Promise<User[]> {
    return this.userModel.find({ role }).exec();
  }

  async findOne(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  async update(id: string, updateUserDto: Partial<CreateUserDto>): Promise<User> {
    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .exec();
    if (!updatedUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return updatedUser;
  }

  async remove(id: string): Promise<User> {
    const deletedUser = await this.userModel.findByIdAndDelete(id).exec();
    if (!deletedUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return deletedUser;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email })
      .select('+password')
      .exec();
  }

  async findOneIdByEmail(email: string): Promise<{ id: string } | null> {
    const user = await this.userModel.findOne({ email }).select('_id').exec();
    return user ? { id: user._id.toString() } : null;
  }

  async addUserToProject(userId: string, projectId: string): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    if (!user.projectIds.includes(projectId)) {
      user.projectIds.push(projectId);
      await user.save();
    }

    return user;
  }

  async removeUserFromProject(userId: string, projectId: string): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    user.projectIds = user.projectIds.filter((id) => id !== projectId);
    await user.save();

    return user;
  }

  async updateUserCompany(userId: string, companyId: string | null): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    user.companyId = companyId;
    await user.save();

    return user;
  }
}