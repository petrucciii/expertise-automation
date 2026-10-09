import { Controller, Get } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  getHello(): object {
    return this.appService.health();
  }
}
