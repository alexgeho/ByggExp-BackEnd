import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserRole } from "../users/schemas/user.schema";
import { CreateNoteDto } from "./dto/create-note.dto";
import { UpdateNoteDto } from "./dto/update-note.dto";
import { Note, NoteDocument } from "./schemas/note.schema";

type AuthUser = {
  role: UserRole;
  companyId?: string | null;
  userId?: string;
  _id?: string;
};

@Injectable()
export class NotesService {
  constructor(@InjectModel(Note.name) private model: Model<NoteDocument>) {}

  private userId(user: AuthUser) {
    return String(user.userId || user._id || "");
  }

  private resolveCompanyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  async create(dto: CreateNoteDto, user: AuthUser) {
    const companyId = this.resolveCompanyId(user);
    const doc = new this.model({
      title: dto.title ?? "",
      body: dto.body ?? "",
      remindAt: dto.remindAt ? new Date(dto.remindAt) : null,
      companyId,
      userId: this.userId(user),
    });
    return doc.save();
  }

  // Personal notes: a user only ever sees their OWN notes (no admin bypass).
  async findAll(user: AuthUser) {
    if (!user.companyId) {
      return [];
    }
    return this.model
      .find({ companyId: user.companyId, userId: this.userId(user) })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findOne(id: string, user: AuthUser) {
    const doc = await this.model.findById(id).exec();
    if (!doc) {
      throw new NotFoundException(`Note "${id}" not found`);
    }
    this.assertOwner(doc, user);
    return doc;
  }

  async update(id: string, dto: UpdateNoteDto, user: AuthUser) {
    const doc = await this.findOne(id, user);
    if (dto.title !== undefined) doc.title = dto.title;
    if (dto.body !== undefined) doc.body = dto.body;
    if (dto.remindAt !== undefined) {
      // Moving or clearing the bell re-arms it, so a note reminded once can be
      // set again for a later time.
      doc.remindAt = dto.remindAt ? new Date(dto.remindAt) : null;
      doc.remindedAt = null;
    }
    // Owner + tenant are immutable.
    await doc.save();
    return doc;
  }

  async remove(id: string, user: AuthUser) {
    const doc = await this.findOne(id, user);
    await this.model.findByIdAndDelete(id).exec();
    return doc;
  }

  // A note is only accessible by its owner, within the same company.
  private assertOwner(doc: NoteDocument, user: AuthUser) {
    if (!user.companyId || String(doc.companyId) !== String(user.companyId)) {
      throw new ForbiddenException("You do not have access to this note");
    }
    if (String(doc.userId) !== this.userId(user)) {
      throw new ForbiddenException("You do not have access to this note");
    }
  }
}
