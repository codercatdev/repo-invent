import express from "express";
import { createOrder, getOrder } from "./orders.js";

const app = express();
app.use(express.json());

app.post("/orders", async (request, response) => {
  const order = await createOrder(request.body);
  response.status(201).json(order);
});

app.get("/orders/:id", async (request, response) => {
  const order = await getOrder(request.params.id);
  if (!order) {
    response.status(404).json({ error: "not found" });
    return;
  }
  response.json(order);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  process.stdout.write(`listening on ${port}\n`);
});
