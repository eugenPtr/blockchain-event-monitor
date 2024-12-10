import { Controller, Get, Param } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/total-bridged/:token/:toChainId')
  async getTotalBridged(
    @Param('token') token: string,
    @Param('toChainId') toChainId: number,
  ): Promise<string> {
    return this.appService.getTotalBridged(token, toChainId);
  }
}
