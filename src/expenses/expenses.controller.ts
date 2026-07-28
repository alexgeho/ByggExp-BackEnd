import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import * as fs from "fs";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";
import { ExpenseStatus } from "./schemas/expense.schema";
import { ExpensesService } from "./expenses.service";

const ADMIN = [
  UserRole.SuperAdmin,
  UserRole.CompanyAdmin,
  UserRole.ProjectAdmin,
];

const receiptStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "./uploads/expenses";
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const base =
      (file.originalname || "kvitto")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 60) || "kvitto";
    cb(null, `${base}-${Date.now()}${extname(file.originalname) || ".jpg"}`);
  },
});

@Controller("expenses")
@UseGuards(AuthGuard("jwt"), RolesGuard)
// Any authenticated user can submit and see their own; method-level @Roles
// tightens the review/reporting endpoints to admins.
@Roles(
  UserRole.SuperAdmin,
  UserRole.CompanyAdmin,
  UserRole.ProjectAdmin,
  UserRole.Worker,
)
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  findAll(
    @Request() req,
    @Query("projectId") projectId?: string,
    @Query("status") status?: string,
  ) {
    return this.service.findAll(req.user, { projectId, status });
  }

  @Post()
  create(@Request() req, @Body() dto: CreateExpenseDto) {
    return this.service.create(dto, req.user);
  }

  @Get("project/:projectId/summary")
  @Roles(...ADMIN)
  projectSummary(@Request() req, @Param("projectId") projectId: string) {
    return this.service.projectSummary(projectId, req.user);
  }

  @Get(":id")
  findOne(@Request() req, @Param("id") id: string) {
    return this.service.findOne(id, req.user);
  }

  @Put(":id")
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Patch(":id/status")
  @Roles(...ADMIN)
  setStatus(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { status: ExpenseStatus },
  ) {
    if (!Object.values(ExpenseStatus).includes(body?.status)) {
      throw new BadRequestException("Invalid status");
    }
    return this.service.setStatus(id, req.user, body.status);
  }

  @Post(":id/receipt")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: receiptStorage,
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async uploadReceipt(
    @Request() req,
    @Param("id") id: string,
    @UploadedFile() file: { filename: string } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    return this.service.update(
      id,
      { receiptUrl: `/uploads/expenses/${file.filename}` },
      req.user,
    );
  }

  @Delete(":id")
  remove(@Request() req, @Param("id") id: string) {
    return this.service.remove(id, req.user);
  }
}
