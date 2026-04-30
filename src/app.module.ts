import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
import { CompanyModule } from './company/company.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { ChatsModule } from './chats/chats.module';
import { MessagesModule } from './messages/messages.module';
import { AuthModule } from './auth/auth.module';
import { ShiftsModule } from './shifts/shifts.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TaskRemindersModule } from './task-reminders/task-reminders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI ?? 'mongodb://localhost:27017/project_management',
    ),
    UsersModule,
    CompanyModule,
    ProjectsModule,
    TasksModule,
    ChatsModule,
    MessagesModule,
    AuthModule,
    ShiftsModule,
    NotificationsModule,
    TaskRemindersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
