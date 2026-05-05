import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { TaskReminder, TaskReminderSchema } from './schemas/task-reminder.schema';
import { TaskRemindersService } from './task-reminders.service';

@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      { name: TaskReminder.name, schema: TaskReminderSchema },
    ]),
  ],
  providers: [TaskRemindersService],
  exports: [MongooseModule, TaskRemindersService],
})
export class TaskRemindersModule {}
