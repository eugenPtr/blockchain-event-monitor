import { ethers } from 'ethers';
import amqp from 'amqplib';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import dotenv from 'dotenv';
import config from '../../utils/config';

dotenv.config();

// Set up Prisma client
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

export interface SocketBridgeEvent {
  blockNumber: number;
  txHash: string;
  chainId: number;
  logIndex: number;
  amount: Decimal;
  token: string;
  toChainId: number;
  bridgeName: string;
  sender: string;
  receiver: string;
  metadata: string;
}

async function main() {
  // Connect to RabbitMQ
  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();
  await channel.assertQueue(config.SOCKET_BRIDGE_EVENTS_QUEUE);

  // Process events from RabbitMQ
  channel.consume(config.SOCKET_BRIDGE_EVENTS_QUEUE, async (msg) => {
    if (msg !== null) {
      try {
        const { chainId, lastFetchedBlock, logs } = JSON.parse(msg.content.toString());

        const socketBridgeEvents: SocketBridgeEvent[] = logs.map((log: any) => {
          // Decode event data
          const decodedData = ethers.AbiCoder.defaultAbiCoder().decode(
            ['uint256', 'address', 'uint256', 'bytes32', 'address', 'address', 'bytes32'],
            log.data
          );

          return {
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            chainId,
            logIndex: log.index,
            amount: new Decimal(decodedData[0].toString()),
            token: decodedData[1],
            toChainId: Number(decodedData[2]),
            bridgeName: decodedData[3],
            sender: decodedData[4],
            receiver: decodedData[5],
            metadata: decodedData[6],
          };
        });

        const writeEvents = prisma.socketBridgeEvent.createMany({
          data: socketBridgeEvents,
          skipDuplicates: true,
        });

        const updateLastProcessedBlock = prisma.chain.update({
          where: { chainId },
          data: { lastProcessedBlock: lastFetchedBlock },
        });

        // Write events and lastFetchedBlock in an atomic transaction
        await prisma.$transaction([writeEvents, updateLastProcessedBlock]);

        // Acknowledge the message
        channel.ack(msg);

        console.log(
          `Processed ${socketBridgeEvents.length} events up to block ${lastFetchedBlock} for chainId ${chainId}`
        );
      } catch (error) {
        console.error(`Error processing events: ${error}`);
        // Reject the message to requeue it
        channel.nack(msg);
        return;
      }
    }
  });
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
});