import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    secret: configService.get<string>('auth.jwtSecret'),
    signOptions: {
      expiresIn: configService.get<string>('auth.jwtExpiresIn') as StringValue,
    },
  }),
});

@Module({
  imports: [jwtModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  // JwtModule is re-exported (not just JwtAuthGuard/RolesGuard) because Nest
  // resolves a guard referenced via @UseGuards(JwtAuthGuard) using the
  // *consuming* module's injector, not AuthModule's — so JwtService must be
  // visible wherever JwtAuthGuard/RolesGuard get used, not just importable.
  exports: [jwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
