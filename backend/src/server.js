import http from "http";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { connectDatabase } from "./db.js";
import { registerMeetingSockets } from "./sockets.js";

dotenv.config();

const app = createApp();
const server = http.createServer(app);

registerMeetingSockets(server);

const port = process.env.PORT || 4000;

await connectDatabase();

server.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
