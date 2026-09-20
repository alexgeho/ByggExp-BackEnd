import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Note, NoteDocument } from "../notes/schemas/note.schema";
import { NotificationsService } from "../notifications/notifications.service";
import { cronsDisabled } from "../common/cron.util";

// A note's bell is a one-shot: the owner gets a single push at the chosen
// moment. Minute-resolution sweep so "remind me at 14:30" lands on time.
@Injectable()
export class NoteRemindersService {
  private readonly logger = new Logger(NoteRemindersService.name);
  private running = false;

  constructor(
    @InjectModel(Note.name) private noteModel: Model<NoteDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    if (cronsDisabled() || this.running) return;
    this.running = true;
    try {
      await this.sendDue();
    } catch (error) {
      this.logger.error("Note reminder sweep failed", error);
    } finally {
      this.running = false;
    }
  }

  async sendDue(): Promise<void> {
    const now = new Date();
    const due = await this.noteModel
      .find({ remindAt: { $ne: null, $lte: now }, remindedAt: null })
      .limit(200)
      .exec();

    for (const note of due) {
      // Stamp first: a push that fails must not make the note nag every minute.
      note.remindedAt = now;
      await note.save();

      const text = (note.body || note.title || "").trim();
      try {
        await this.notificationsService.sendToUsers([String(note.userId)], {
          title: "Påminnelse",
          body: text.slice(0, 140) || "Anteckning",
          data: {
            type: "note_reminder",
            screen: "Main",
            entityId: String(note._id),
          },
        });
      } catch (error) {
        this.logger.error("Failed to send note reminder", error);
      }
    }
  }
}
