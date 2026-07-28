import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AtaController } from "./ata.controller";
import { AtaService } from "./ata.service";
import { Ata, AtaSchema } from "./schemas/ata.schema";

@Module({
  imports: [MongooseModule.forFeature([{ name: Ata.name, schema: AtaSchema }])],
  controllers: [AtaController],
  providers: [AtaService],
  exports: [AtaService],
})
export class AtaModule {}
