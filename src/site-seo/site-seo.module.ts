import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SiteSeoController } from "./site-seo.controller";
import { SiteSeoService } from "./site-seo.service";
import { SiteSeo, SiteSeoSchema } from "./schemas/site-seo.schema";

@Module({
  imports: [MongooseModule.forFeature([{ name: SiteSeo.name, schema: SiteSeoSchema }])],
  controllers: [SiteSeoController],
  providers: [SiteSeoService],
})
export class SiteSeoModule {}
