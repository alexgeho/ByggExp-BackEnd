import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { CreateTaskDto } from "./dto/create-task.dto";
import { TasksService } from "./tasks.service";
import { UpdateTaskDto } from "./dto/update-task.dto";

const taskDocumentsStorage = diskStorage({
  destination: "./uploads/task-documents",
  filename: (_req, file, callback) => {
    const safeBaseName =
      file.originalname
        .replace(extname(file.originalname), "")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .slice(0, 80) || "document";

    callback(
      null,
      `${Date.now()}-${safeBaseName}${extname(file.originalname)}`,
    );
  },
});

type UploadedDocumentFile = {
  originalname: string;
  filename: string;
  mimetype: string;
};

@Controller("tasks")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  findAllAccessible(@Request() req) {
    return this.tasksService.findAccessible(req.user);
  }

  @Post()
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  @UseInterceptors(
    FilesInterceptor("documents", 10, { storage: taskDocumentsStorage }),
  )
  create(
    @Request() req,
    @Body() createTaskDto: CreateTaskDto,
    @UploadedFiles() files: UploadedDocumentFile[],
  ) {
    if (files?.length) {
      createTaskDto.documents = files.map((file) => ({
        name: file.originalname,
        url: `/uploads/task-documents/${file.filename}`,
        mimeType: file.mimetype,
      }));
    }

    if (req.user.role === UserRole.Worker) {
      if (
        createTaskDto.assigneeUserId &&
        String(createTaskDto.assigneeUserId) !== String(req.user.userId)
      ) {
        throw new ForbiddenException(
          "Workers can only create tasks assigned to themselves.",
        );
      }

      createTaskDto.assigneeUserId = String(req.user.userId);
    }

    return this.tasksService.create(createTaskDto, req.user);
  }

  @Get("project/:projectId")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  findByProject(@Param("projectId") projectId: string, @Request() req) {
    return this.tasksService.findByProject(projectId, req.user);
  }

  @Put(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async update(
    @Request() req,
    @Param("id") id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    await this.tasksService.assertTaskAccessById(id, req.user);
    return this.tasksService.update(id, updateTaskDto, req.user.userId);
  }

  @Patch(":id/complete")
  @Roles(
    UserRole.SuperAdmin,
    UserRole.CompanyAdmin,
    UserRole.ProjectAdmin,
    UserRole.Worker,
  )
  async complete(@Request() req, @Param("id") id: string) {
    await this.tasksService.assertTaskAccessById(id, req.user);
    return this.tasksService.complete(id, req.user.userId);
  }

  @Patch(":id/reopen")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async reopen(@Request() req, @Param("id") id: string) {
    await this.tasksService.assertTaskAccessById(id, req.user);
    return this.tasksService.reopen(id, req.user.userId);
  }

  @Delete(":id")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async remove(@Param("id") id: string, @Request() req) {
    await this.tasksService.assertTaskAccessById(id, req.user);
    return this.tasksService.remove(id);
  }
}
