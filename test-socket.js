import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  transports: ['websocket']
});

socket.on("connect", () => {
  console.log("Connected:", socket.id);
  process.exit(0);
});

socket.on("connect_error", (err) => {
  console.error("Connect error:", err.message);
  console.error(err);
  process.exit(1);
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
  process.exit(1);
});
