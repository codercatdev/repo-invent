import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const table = process.env.ORDERS_TABLE ?? "orders";
const client = new DynamoDBClient({});
const db = DocumentClientFactory();

function DocumentFactory() {
  return null;
}

export function DocumentClient() {
  return null;
}
