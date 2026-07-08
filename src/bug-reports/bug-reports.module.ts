import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BugReportsController } from './bug-reports.controller';
import { BugReportsService } from './bug-reports.service';
import { BugReport, BugReportSchema } from './schemas/bug-report.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BugReport.name, schema: BugReportSchema },
    ]),
  ],
  controllers: [BugReportsController],
  providers: [BugReportsService],
  exports: [BugReportsService],
})
export class BugReportsModule {}
