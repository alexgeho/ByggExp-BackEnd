import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ProjektkalkylController } from "./projektkalkyl.controller";
import { ProjektkalkylService } from "./projektkalkyl.service";
import {
  Projektkalkyl,
  ProjektkalkylSchema,
} from "./schemas/projektkalkyl.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Projektkalkyl.name, schema: ProjektkalkylSchema },
    ]),
  ],
  controllers: [ProjektkalkylController],
  providers: [ProjektkalkylService],
  exports: [ProjektkalkylService],
})
export class ProjektkalkylModule {}
