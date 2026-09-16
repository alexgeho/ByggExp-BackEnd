import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { CreateNoteDto } from "./dto/create-note.dto";
import { UpdateNoteDto } from "./dto/update-note.dto";
import { NotesService } from "./notes.service";

@Controller("notes")
@UseGuards(AuthGuard("jwt"), RolesGuard)
// Personal notes: any authenticated user manages their own.
@Roles(
  UserRole.SuperAdmin,
  UserRole.CompanyAdmin,
  UserRole.ProjectAdmin,
  UserRole.Worker,
)
export class NotesController {
  constructor(private readonly service: NotesService) {}

  @Get()
  findAll(@Request() req) {
    return this.service.findAll(req.user);
  }

  @Post()
  create(@Request() req, @Body() dto: CreateNoteDto) {
    return this.service.create(dto, req.user);
  }

  @Get(":id")
  findOne(@Request() req, @Param("id") id: string) {
    return this.service.findOne(id, req.user);
  }

  @Put(":id")
  update(@Request() req, @Param("id") id: string, @Body() dto: UpdateNoteDto) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(":id")
  remove(@Request() req, @Param("id") id: string) {
    return this.service.remove(id, req.user);
  }
}
