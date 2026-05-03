import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Company, CompanySchema } from '../company/schemas/company.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { DeviceToken, DeviceTokenSchema } from '../notifications/schemas/device-token.schema';
import { UserActivityLog, UserActivityLogSchema } from './schemas/user-activity-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Project.name, schema: ProjectSchema },
      { name: DeviceToken.name, schema: DeviceTokenSchema },
      { name: UserActivityLog.name, schema: UserActivityLogSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}