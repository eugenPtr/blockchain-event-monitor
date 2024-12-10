import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  async getTotalBridged(token: string, toChainId: number): Promise<string> {
    const result = await this.prisma.$queryRaw<{ sum: Decimal }[]>`
      SELECT COALESCE(SUM(CAST(amount AS DECIMAL(78, 0))), 0) AS sum
      FROM socket_bridge_event
      WHERE token = ${token} AND "toChainId" = ${Number(toChainId)}
    `;

    return result[0].sum.toFixed(0);
  }
}
