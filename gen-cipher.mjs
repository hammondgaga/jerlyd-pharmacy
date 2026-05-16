import { generateEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import dotenv from "dotenv";
dotenv.config();

const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
const apiKey = process.env.CIRCLE_API_KEY;

const ciphertext = await generateEntitySecretCiphertext(entitySecret, apiKey);
console.log(ciphertext);