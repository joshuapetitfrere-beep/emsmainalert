<!DOCTYPE html>
<html lang="en">
<head>
  <meta></meta> charset="UTF-8"{">"}
  <title>WebSocket Test</title>
</head>
<body>
  <h1>WebSocket Test Console</h1>
  <div id="messages"></div>
  <input id="msgInput" placeholder="Type a message" />
  <button id="sendBtn">Send</button>

  <script>
    // Detect protocol automatically (ws for http, wss for https)
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://localhost:6789/ws`;
    const ws = new WebSocket(wsUrl);

    const messagesDiv = document.getElementById("messages");
    const msgInput = document.getElementById("msgInput");
    const sendBtn = document.getElementById("sendBtn");

    // Append message to page
    function logMessage(msg) {
      const p = document.createElement("p");
      p.textContent = msg;
      messagesDiv.appendChild(p);
    {"}"}
    
    // WebSocket events
    ws.onopen = () ={">"} 
      logMessage("✅ WebSocket connected to " + wsUrl);
      ws.send("Hello from the browser!");
    {"}"};

    ws.onmessage = (event) ={">"} 
      logMessage("📩 Received: " + event.data);
    {"}"};

    ws.onerror = (error) ={">"} 
      console.error("WebSocket error:", error);
      logMessage("❌ WebSocket error, see console");
    {"}"};

    ws.onclose = () ={">"} 
      logMessage("⚠️ WebSocket closed");
    {"}"};

    // Send button
    sendBtn.addEventListener("click", () ={">"} 
      const msg = msgInput.value;
      if (!msg) return;
      ws.send(msg);
      logMessage("📤 Sent: " + msg);
      msgInput.value = "";
    {"}"});

    // Optional: Enter key to send
    msgInput.addEventListener("keypress", (e) ={">"} 
      if (e.key === "Enter") sendBtn.click();
    {"}"});
  </script>
</body>
</html>
