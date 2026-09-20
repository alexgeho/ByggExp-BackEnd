import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Note, NoteSchema } from "../notes/schemas/note.schema";
import { NotificationsModule } from "../notifications/notifications.module";
import { NoteRemindersService } from "./note-reminders.service";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Note.name, schema: NoteSchema }]),
    NotificationsModule,
  ],
  providers: [NoteRemindersService],
})
export class NoteRemindersModule {}
