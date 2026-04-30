import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TaskReminder, TaskReminderSchema } from './schemas/task-reminder.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaskReminder.name, schema: TaskReminderSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class TaskRemindersModule {}
