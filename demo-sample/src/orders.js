import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const table = process.env.ORDERS_TABLE ?? "orders";
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Create an order.
 *
 * Deliberately plain: a single write, no Streams consumer, no dead-letter
 * queue, and no tracing. That is what repo:Invent reports as gaps.
 */
export async function createOrder(input) {
  const orderId = randomUUID();
  await db.send(
    new PutCommand({
      TableName: table,
      Item: {
        orderId,
        customerId: input.customerId,
        total: input.total,
        status: "created",
        createdAt: new Date().toISOString(),
      },
    }),
  );
  return { orderId };
}

export async function getOrder(orderId) {
  const result = await db.send(new GetCommand({ TableName: table, Key: { orderId } }));
  return result.Item ?? null;
}
