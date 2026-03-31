import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Company, CompanyDocument } from './schemas/company.schema';
import { CreateCompanyDto } from './dto/create-company.dto';
import { RegisterCompanyWithAdminDto } from './dto/register-company-with-admin.dto';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';

@Injectable()
export class CompanyService {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private usersService: UsersService,
  ) {}

  async create(createCompanyDto: CreateCompanyDto): Promise<CompanyDocument> {
    const createdCompany = new this.companyModel(createCompanyDto);
    return createdCompany.save();
  }

  async registerCompanyWithAdmin(dto: RegisterCompanyWithAdminDto): Promise<{ company: Company; admin: any }> {
    // Проверяем существование компании
    const existingCompany = await this.companyModel.findOne({ email: dto.email }).exec();
    if (existingCompany) {
      throw new ConflictException('Company with this email already exists');
    }

    // Проверяем существование админа
    const existingAdmin = await this.usersService.findByEmail(dto.adminEmail);
    if (existingAdmin) {
      throw new ConflictException('User with this email already exists');
    }

    // Создаём компанию
    const company = await this.create({
      name: dto.name,
      address: dto.address,
      email: dto.email,
      companyAdmins: [],
      projects: [],
    });

    // Создаём CompanyAdmin
    const hashedPassword = await bcrypt.hash(dto.adminPassword, 10);
    const admin = await this.usersService.create({
      email: dto.adminEmail,
      password: hashedPassword,
      name: dto.adminName,
      phoneAreaCode: dto.adminPhoneAreaCode ? parseInt(dto.adminPhoneAreaCode.replace(/\D/g, '')) || 7 : 7,
      phoneNumber: dto.adminPhoneNumber ? parseInt(dto.adminPhoneNumber.replace(/\D/g, '')) : 0,
      role: UserRole.CompanyAdmin,
      companyId: company._id.toString(),
      projectIds: [],
    });

    // Добавляем админа в список companyAdmins компании
    await this.companyModel.findByIdAndUpdate(company._id, {
      $push: { companyAdmins: admin._id.toString() },
    });

    return { company: company.toObject(), admin };
  }

  async findAll(): Promise<Company[]> {
    return this.companyModel.find().exec();
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.companyModel.findById(id).exec();
    if (!company) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }
    return company;
  }

  async findOneByEmail(email: string): Promise<Company | null> {
    return this.companyModel.findOne({ email }).exec();
  }

  async findByIds(ids: string[]): Promise<Company[]> {
    return this.companyModel.find({ _id: { $in: ids } })
      .select('name email address companyAdmins projects')
      .exec();
  }

  async findCompanyById(id: string): Promise<{ id: string; name: string; email: string } | null> {
    const company = await this.companyModel.findById(id).select('name email').exec();
    if (!company) return null;
    return {
      id: company._id.toString(),
      name: company.name,
      email: company.email,
    };
  }

  async addAdmin(companyId: string, userId: string): Promise<Company> {
    const company = await this.findOne(companyId);

    if (!company.companyAdmins.includes(userId)) {
      await this.companyModel.findByIdAndUpdate(companyId, {
        $push: { companyAdmins: userId },
      });
    }

    return this.findOne(companyId);
  }

  async removeAdmin(companyId: string, userId: string): Promise<Company> {
    const company = await this.findOne(companyId);

    await this.companyModel.findByIdAndUpdate(companyId, {
      $pull: { companyAdmins: userId },
    });

    return this.findOne(companyId);
  }

  async addProject(companyId: string, projectId: string): Promise<Company> {
    const company = await this.findOne(companyId);

    if (!company.projects.includes(projectId)) {
      await this.companyModel.findByIdAndUpdate(companyId, {
        $push: { projects: projectId },
      });
    }

    return this.findOne(companyId);
  }

  async update(id: string, updateCompanyDto: Partial<CreateCompanyDto>): Promise<Company> {
    const updatedCompany = await this.companyModel
      .findByIdAndUpdate(id, updateCompanyDto, { new: true })
      .exec();
    if (!updatedCompany) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }
    return updatedCompany;
  }

  async remove(id: string): Promise<Company> {
    const deletedCompany = await this.companyModel.findByIdAndDelete(id).exec();
    if (!deletedCompany) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }
    return deletedCompany;
  }

  async findByName(name: string): Promise<CompanyDocument | null> {
    return this.companyModel.findOne({ name }).exec();
  }
}