import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/schemas/user.schema';
import { ProjectsService } from '../../projects/projects.service';
import { CompanyService } from '../../company/company.service';

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
      throw new ForbiddenException('User not authenticated');
    }

    // SuperAdmin имеет доступ ко всем проектам
    if (user.role === UserRole.SuperAdmin) {
      return true;
    }

    const projectId = request.params.id || request.params.projectId;

    if (!projectId) {
      return true;
    }

    try {
      const project = await this.projectsService.findOne(projectId);

      // CompanyAdmin имеет доступ ко всем проектам своей компании
      if (user.role === UserRole.CompanyAdmin) {
        return project.companyId === user.companyId;
      }

      // ProjectAdmin имеет доступ только к своим проектам
      if (user.role === UserRole.ProjectAdmin) {
        return project.projectAdmins.includes(user.sub) || project.ownerId === user.sub;
      }

      // Worker имеет доступ только к проектам, где он является работником
      if (user.role === UserRole.Worker) {
        return project.workers.includes(user.sub);
      }

      return false;
    } catch {
      throw new NotFoundException('Project not found');
    }
  }
}
