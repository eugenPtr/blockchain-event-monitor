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
const amqplib_1 = __importDefault(require("amqplib"));
const dotenv_1 = __importDefault(require("dotenv"));
const config_1 = __importDefault(require("../../utils/config"));
dotenv_1.default.config();
const RABBITMQ_URL = process.env.RABBITMQ_URL;
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const connection = yield amqplib_1.default.connect(RABBITMQ_URL);
        const channel = yield connection.createChannel();
        yield channel.assertQueue(config_1.default.SOCKET_BRIDGE_EVENTS_QUEUE);
        // Replace polling with event-driven consumption
        yield channel.consume(config_1.default.SOCKET_BRIDGE_EVENTS_QUEUE, (msg) => {
            if (msg) {
                try {
                    const event = JSON.parse(msg.content.toString());
                    console.log(`Received event from RabbitMQ: ${JSON.stringify(event)}`);
                    channel.ack(msg);
                }
                catch (error) {
                    console.error('Error processing message:', error);
                }
            }
        });
        console.log('Worker is running and waiting for messages...');
    });
}
main().catch((err) => console.error(err));
