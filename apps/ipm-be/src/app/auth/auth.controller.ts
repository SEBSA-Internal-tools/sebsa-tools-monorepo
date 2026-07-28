import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthUser, LoginResponse } from '@sebsa-pm-tool/shared-models';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: Request & { user: AuthUser }): AuthUser {
    return request.user;
  }
}
