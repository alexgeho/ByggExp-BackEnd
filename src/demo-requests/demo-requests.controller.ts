import { Body, Controller, Post } from "@nestjs/common";
import { CreateDemoRequestDto } from "./dto/create-demo-request.dto";
import { DemoRequestsService } from "./demo-requests.service";
import { Public } from "../common/decorators/public.decorator";

@Public()
@Controller("demo-requests")
export class DemoRequestsController {
  constructor(private readonly demoRequestsService: DemoRequestsService) {}

  @Post()
  create(@Body() dto: CreateDemoRequestDto) {
    return this.demoRequestsService.create(dto);
  }
}
