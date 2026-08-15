import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { UsersModule } from "src/users/users.module";
import { CompanyModule } from "../company/company.module";
import { AuthController } from "./auth.controller";
import { PendingRegistrationsController } from "./pending-registrations.controller";
import { requireJwtSecret } from "./jwt-secret";
import { MailModule } from "../mail/mail.module";
import {
  PendingRegistration,
  PendingRegistrationSchema,
} from "./schemas/pending-registration.schema";

@Module({
  imports: [
    UsersModule,
    CompanyModule,
    ConfigModule,
    MailModule,
    MongooseModule.forFeature([
      { name: PendingRegistration.name, schema: PendingRegistrationSchema },
    ]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: requireJwtSecret(configService),
        signOptions: { expiresIn: "15m" },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController, PendingRegistrationsController],
  exports: [AuthService],
})
export class AuthModule {}
