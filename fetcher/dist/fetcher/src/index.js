"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Set up environment variables
const RPC_URL = process.env.RPC_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const CHAIN_ID = parseInt(process.env.CHAIN_ID);
const RABBITMQ_URL = process.env.RABBITMQ_URL;
// Set up provider with ethers
const provider = new ethers_1.ethers.JsonRpcProvider(RPC_URL);
// Set up topic filter for SocketBridge event
const socketBridgeEventTopic = ethers_1.ethers.id("SocketBridge(uint256,address,uint256,bytes32,address,address,bytes32)");
// Set up Prisma client
// const prisma = new PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // Fetch the last processed block from db
        //   const chain = await prisma.chain.findUnique({
        //     where: { id: CHAIN_ID },
        //   });
        //   let lastProcessedBlock = chain?.lastProcessedBlock || 0;
        // Declare last_fetched_block
        let lastFetchedBlock = null;
        // Connect to RabbitMQ
        //   const connection = await amqp.connect(RABBITMQ_URL);
        //   const channel = await connection.createChannel();
        //   await channel.assertQueue('socketBridgeEvents');
        while (true) {
            // Determine from_block
            // const fromBlock = lastFetchedBlock ?? lastProcessedBlock;
            const fromBlock = lastFetchedBlock !== null && lastFetchedBlock !== void 0 ? lastFetchedBlock : 16875644;
            // Fetch events in batches of 1000 blocks
            const toBlock = fromBlock + 1000;
            const logs = yield provider.getLogs({
                address: CONTRACT_ADDRESS,
                fromBlock,
                toBlock,
                topics: [socketBridgeEventTopic],
            });
            // Push events to RabbitMQ
            for (const log of logs) {
                // decode event args
                const decodedData = ethers_1.ethers.AbiCoder.defaultAbiCoder().decode(['uint256', 'address', 'uint256', 'bytes32', 'address', 'address', 'bytes32'], log.data);
                const event = {
                    blockNumber: BigInt(log.blockNumber),
                    txHash: log.transactionHash,
                    chainId: CHAIN_ID,
                    amount: decodedData[0],
                    token: decodedData[1],
                    toChainId: decodedData[2],
                    bridgeName: decodedData[3],
                    sender: decodedData[4],
                    receiver: decodedData[5],
                    metadata: decodedData[6],
                };
                //   channel.sendToQueue('socketBridgeEvents', Buffer.from(JSON.stringify(event)));
                console.log(event);
            }
            // Remember last_fetched_block
            lastFetchedBlock = toBlock;
            // Sleep for 2 seconds
            yield new Promise(resolve => setTimeout(resolve, 2000));
        }
    });
}
main().catch(e => {
    console.error(e);
    //   prisma.$disconnect();
});
