import WebSocket from 'ws';

console.log("Connecting to WebSocket on scopuli...");
const ws = new WebSocket('ws://192.168.1.147:3000/api/filings/data-explorer');

ws.on('open', () => {
    console.log("Connected successfully!");
});

ws.on('message', (data) => {
    console.log("Received message:", data.toString());
});

ws.on('error', (err) => {
    console.error("WebSocket Error:", err);
});

ws.on('close', (code, reason) => {
    console.log("WebSocket Closed. Code:", code, "Reason:", reason.toString());
});
