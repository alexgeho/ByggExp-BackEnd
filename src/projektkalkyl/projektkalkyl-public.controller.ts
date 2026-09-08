import { Controller, Get, Param } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { ProjektkalkylService } from "./projektkalkyl.service";

// Public, unauthenticated read-only access to a shared calculation via its
// share token. No class guards here (unlike ProjektkalkylController) so the
// global JwtAuthGuard is opted out via @Public().
@Public()
@Controller("projektkalkyl-public")
export class ProjektkalkylPublicController {
  constructor(private readonly service: ProjektkalkylService) {}

  @Get(":token")
  findByToken(@Param("token") token: string) {
    return this.service.findByShareToken(token);
  }
}
