import { ethers } from 'ethers';
import amqp from 'amqplib';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import config from '../../utils/config';

dotenv.config();

// Set up environment variables
const RPC_URL = process.env.RPC_URL!;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS!;
const CHAIN_ID = parseInt(process.env.CHAIN_ID!);
const CONTRACT_DEPLOYMENT_BLOCK = parseInt(process.env.CONTRACT_DEPLOYMENT_BLOCK!);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE!);
const POLLING_INTERVAL_MS = parseInt(process.env.POLLING_INTERVAL_MS!);
const RABBITMQ_URL = process.env.RABBITMQ_URL!;

// Set up provider with ethers
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Set up topic filter for SocketBridge event
const socketBridgeEventTopic = ethers.id('SocketBridge(uint256,address,uint256,bytes32,address,address,bytes32)');

// Set up Prisma client
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});


/**
 * Calculates the block interval for fetching events based on the last fetched, processed and mined blocks
 * @param lastFetchedBlock - The last block number that was fetched for events in the previous iteration
 * @param lastProcessedBlock - The last block number stored in the db
 * @param lastMinedBlock - The latest block number that has been mined on the blockchain
 * @returns An object containing fromBlock and toBlock that define the interval to fetch
 *          fromBlock: The starting block number (inclusive) for the next fetch
 *          toBlock: The ending block number (inclusive) for the next fetch, limited by BATCH_SIZE
 */
const calculateBlockInterval = (lastFetchedBlock: number, lastProcessedBlock: number, lastMinedBlock: number) => {
  const fromBlock: number = (lastFetchedBlock > 0 ? lastFetchedBlock : lastProcessedBlock) + 1;
  const toBlock: number = Math.min(fromBlock + BATCH_SIZE, lastMinedBlock);
  return {fromBlock, toBlock};
}

/**
 * Makes a HTTP request with exponential backoff retry logic
 * @param fn - The async function to execute that makes the HTTP request
 * @param maxRetries - Maximum number of retry attempts (default: 5)
 * @param baseDelay - Base delay in milliseconds between retries (default: 1000)
 * @returns The result of the successful request
 * @throws Error if all retries are exhausted
 */
const callWithExponentialBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000
): Promise<T> => {
  let retryCount = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      retryCount++;
      
      if (retryCount > maxRetries) {
        throw new Error(`Failed after ${maxRetries} retries: ${error}`);
      }

      // Calculate delay with exponential backoff and some random jitter
      const delay = baseDelay * Math.pow(2, retryCount - 1);
      
      console.log(`RPC request failed, retrying in ${Math.round(delay)}ms (attempt ${retryCount}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};


const main = async () => {
  // Connect to RabbitMQ
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue(config.SOCKET_BRIDGE_EVENTS_QUEUE);

  const chain = await prisma.chain.findUnique({
    where: { chainId: CHAIN_ID },
  });

  if (!chain) {
    console.error("Chain not found");
    return;
  }

  let lastProcessedBlock: number = Math.max(chain.lastProcessedBlock, CONTRACT_DEPLOYMENT_BLOCK);
  let lastFetchedBlock: number = -1;


  while (true) {
    // Sleep for 2 seconds
    await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));

    const lastMinedBlock: number = await callWithExponentialBackoff(() => provider.getBlockNumber());
    const {fromBlock, toBlock} = calculateBlockInterval(lastFetchedBlock, lastProcessedBlock, lastMinedBlock);

    if (fromBlock >= lastMinedBlock) {
        console.log("No new blocks to fetch");
        continue;
    }
    
    console.log(`Fetching events in the block interval [${fromBlock} to ${toBlock}]`);
    const logs = await callWithExponentialBackoff(() => provider.getLogs({
      address: CONTRACT_ADDRESS,
      fromBlock,
      toBlock,
      topics: [socketBridgeEventTopic],
    }));

    if (logs.length) {
      const message = {
        chainId: CHAIN_ID, 
        lastFetchedBlock: toBlock,
        logs
      };
      channel.sendToQueue(config.SOCKET_BRIDGE_EVENTS_QUEUE, Buffer.from(JSON.stringify(message)));
      console.log(`Sent ${logs.length} events in the block interval [${fromBlock} to ${toBlock}] to RabbitMQ`);
    } else {
      console.log(`No events found`);
    }

    lastFetchedBlock = toBlock;
  }
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
}); 