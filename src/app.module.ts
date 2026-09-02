import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { UsersModule } from "./users/users.module";
import { CompanyModule } from "./company/company.module";
import { ProjectsModule } from "./projects/projects.module";
import { TasksModule } from "./tasks/tasks.module";
import { ChatsModule } from "./chats/chats.module";
import { MessagesModule } from "./messages/messages.module";
import { AuthModule } from "./auth/auth.module";
import { ShiftsModule } from "./shifts/shifts.module";
import { HoursModule } from "./hours/hours.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { TaskRemindersModule } from "./task-reminders/task-reminders.module";
import { ManagerRemindersModule } from "./manager-reminders/manager-reminders.module";
import { HoursRemindersModule } from "./hours-reminders/hours-reminders.module";
import { GoalsModule } from "./goals/goals.module";
import { ToolsModule } from "./tools/tools.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { PayrollModule } from "./payroll/payroll.module";
import { SupplierInvoicesModule } from "./supplier-invoices/supplier-invoices.module";
import { InboundInvoicesModule } from "./inbound-invoices/inbound-invoices.module";
import { AuditModule } from "./audit/audit.module";
import { BillingModule } from "./billing/billing.module";
import { ClientsModule } from "./clients/clients.module";
import { ArticlesModule } from "./articles/articles.module";
import { OffersModule } from "./offers/offers.module";
import { OfferDraftModule } from "./offer-draft/offer-draft.module";
import { BugReportsModule } from "./bug-reports/bug-reports.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { MailModule } from "./mail/mail.module";
import { BlogPostsModule } from "./blog-posts/blog-posts.module";
import { SiteSeoModule } from "./site-seo/site-seo.module";
import { AtaModule } from "./ata/ata.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { AccountingModule } from "./accounting/accounting.module";
import { DagbokModule } from "./dagbok/dagbok.module";
import { ChecklistsModule } from "./checklists/checklists.module";
import { PaymentPlansModule } from "./payment-plans/payment-plans.module";
import { LeaveModule } from "./leave/leave.module";
import { AssignmentsModule } from "./assignments/assignments.module";
import { TeamsModule } from "./teams/teams.module";
import { GdprModule } from "./gdpr/gdpr.module";
import { ModerationModule } from "./moderation/moderation.module";
import { CertificateRemindersModule } from "./certificate-reminders/certificate-reminders.module";
import { ScanningModule } from "./scanning/scanning.module";
import { SystemModule } from "./system/system.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MongooseModule.forRoot(
      process.env.MONGODB_URI ?? "mongodb://localhost:27017/project_management",
    ),
    UsersModule,
    CompanyModule,
    ModerationModule,
    ProjectsModule,
    TasksModule,
    ChatsModule,
    MessagesModule,
    AuthModule,
    ShiftsModule,
    HoursModule,
    NotificationsModule,
    TaskRemindersModule,
    ManagerRemindersModule,
    HoursRemindersModule,
    GoalsModule,
    ToolsModule,
    InvoicesModule,
    PayrollModule,
    SupplierInvoicesModule,
    InboundInvoicesModule,
    AuditModule,
    BillingModule,
    AtaModule,
    ExpensesModule,
    AccountingModule,
    DagbokModule,
    ChecklistsModule,
    PaymentPlansModule,
    LeaveModule,
    AssignmentsModule,
    TeamsModule,
    GdprModule,
    CertificateRemindersModule,
    ScanningModule,
    SystemModule,
    OffersModule,
    OfferDraftModule,
    ClientsModule,
    ArticlesModule,
    BlogPostsModule,
    SiteSeoModule,
    BugReportsModule,
    AnalyticsModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Authenticate every route by default; @Public() opts specific routes out.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
