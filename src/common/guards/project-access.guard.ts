import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "../../users/schemas/user.schema";
import { ProjectsService } from "../../projects/projects.service";
import { CompanyService } from "../../company/company.service";

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private projectsService: ProjectsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("User not authenticated");
    }

    // SuperAdmin has access to all projects
    if (user.role === UserRole.SuperAdmin) {
      return true;
    }

    const projectId = request.params.id || request.params.projectId;

    if (!projectId) {
      return true;
    }

    try {
      const project = await this.projectsService.findOne(projectId);

      // CompanyAdmin has access to all projects in its company
      if (user.role === UserRole.CompanyAdmin) {
        return project.companyId === user.companyId;
      }

      // ProjectAdmin has access only to its own projects
      if (user.role === UserRole.ProjectAdmin) {
        return (
          project.projectAdmins.includes(user.sub) ||
          project.ownerId === user.sub
        );
      }

      // Worker has access only to projects where they are a member
      if (user.role === UserRole.Worker) {
        return project.workers.includes(user.sub);
      }

      return false;
    } catch {
      throw new NotFoundException("Project not found");
    }
  }
}
